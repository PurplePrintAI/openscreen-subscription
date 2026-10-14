import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
	VoiceInstallPlan,
	VoiceInstallStatus,
	VoiceProbe,
} from "../../src/lib/narration-install";
import { runLocal } from "../hyperframes/runtime";
import { downloadModelFile } from "./install-download";
import manifest from "./preset-manifest.json";
import { narrationEnvironment } from "./service";

type Manifest = typeof manifest;
const probeSchema = z.object({
	ready: z.boolean(),
	python: z.string(),
	cuda: z.boolean(),
	gpu: z.string().optional(),
	vramBytes: z.number().optional(),
	error: z.string().optional(),
});
interface Dependencies {
	profile: string;
	scriptDir: string;
	override: boolean;
	platform?: NodeJS.Platform;
	arch?: string;
	manifest?: Manifest;
	probe?: (python: string, signal: AbortSignal) => Promise<VoiceProbe>;
	space?: (folder: string) => Promise<number>;
	download?: typeof downloadModelFile;
}
const safePath = (p: string) => path.isAbsolute(p) && !/^(?:\\\\|\/\/)/.test(p);
async function settings(file: string) {
	try {
		if ((await fs.stat(file)).size > 16_384) throw new Error("configuration");
		return await fs.readFile(file, "utf8");
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw e;
	}
}
export class NarrationInstallService {
	private state: VoiceInstallStatus = { phase: "idle", paths: {} };
	private owner: number | null = null;
	private controller: AbortController | null = null;
	private baseline: string | null = null;
	private plan: VoiceInstallPlan | null = null;
	private model: Manifest;
	constructor(private deps: Dependencies) {
		this.model = deps.manifest ?? manifest;
	}
	private file() {
		return path.join(this.deps.profile, "narration-runtime.json");
	}
	private async claim(owner: number) {
		if (this.owner === owner) return;
		if (this.controller) throw new Error("busy");
		this.owner = owner;
		this.plan = null;
		this.state = { phase: "idle", paths: {} };
		try {
			const config = JSON.parse((await settings(this.file())) ?? "{}");
			for (const [field, key] of [
				["python", "pythonPath"],
				["model", "presetModel"],
			] as const)
				if (typeof config[key] === "string") this.state.paths[field] = config[key];
		} catch {
			/* Configuration errors are surfaced at planning, not overwritten. */
		}
	}
	async status(owner: number) {
		await this.claim(owner);
		return structuredClone(this.state);
	}
	cancel(owner: number) {
		if (this.owner === owner) {
			this.controller?.abort();
			this.plan = null;
			this.state.plan = undefined;
			if (!this.controller && this.state.phase !== "complete") this.state.phase = "cancelled";
		}
	}
	close(owner: number) {
		if (this.owner === owner) {
			this.controller?.abort();
			this.plan = null;
			this.owner = null;
		}
	}
	async pick(
		owner: number,
		field: "python" | "storage" | "model",
		choose: () => Promise<string | null>,
	) {
		await this.claim(owner);
		if (this.controller) throw new Error("busy");
		const selected = await choose();
		if (this.owner !== owner) throw new Error("closed");
		if (selected) {
			if (!safePath(selected)) throw new Error("local-path");
			this.state.paths[field] = await fs.realpath(selected);
			this.plan = null;
			this.state.plan = undefined;
			this.state.phase = "idle";
		}
		return this.status(owner);
	}
	private async verify(folder: string, signal: AbortSignal) {
		for (const item of this.model.files) {
			signal.throwIfAborted();
			const file = path.join(folder, item.path);
			if ((await fs.stat(file).catch(() => null))?.size !== item.bytes)
				throw new Error("model-integrity");
			const hash = createHash("sha256");
			for await (const chunk of createReadStream(file, { signal })) hash.update(chunk);
			if (hash.digest("hex") !== item.sha256) throw new Error("model-integrity");
		}
	}
	private async probe(python: string, signal: AbortSignal): Promise<VoiceProbe> {
		if (this.deps.probe) return this.deps.probe(python, signal);
		const folder = path.join(this.deps.profile, "narration-diagnostics");
		await fs.mkdir(folder, { recursive: true });
		const env = {
			...narrationEnvironment(),
			// Packaged scripts may live in a read-only install directory.
			PYTHONDONTWRITEBYTECODE: "1",
			TORCH_HOME: folder,
			CUDA_CACHE_PATH: path.join(folder, "cuda"),
		};
		const result = await runLocal(
			python,
			[path.join(this.deps.scriptDir, "probe_runtime.py")],
			folder,
			env,
			signal,
			90_000,
		);
		return probeSchema.parse(JSON.parse(result.trim().split(/\r?\n/).at(-1)!));
	}
	async prepare(owner: number, mode: "download" | "reuse") {
		await this.claim(owner);
		if (this.controller) throw new Error("busy");
		const controller = new AbortController();
		this.controller = controller;
		this.plan = null;
		this.state = {
			...this.state,
			phase: "planning",
			plan: undefined,
			error: undefined,
			receivedBytes: 0,
		};
		const bytes = this.model.files.reduce((sum, item) => sum + item.bytes, 0);
		const plan: VoiceInstallPlan = {
			id: randomUUID(),
			mode,
			pythonPath: this.state.paths.python ?? "",
			modelPath: "",
			model: this.model.repository,
			revision: this.model.revision,
			bytes,
			downloadBytes: mode === "download" ? bytes : 0,
			requiredFreeBytes: mode === "download" ? bytes + 512 * 1024 ** 2 : 0,
			freeBytes: 0,
			expiresAt: Date.now() + 15 * 60_000,
			issues: [],
		};
		try {
			if (this.deps.override) plan.issues.push("override");
			if (
				(this.deps.platform ?? process.platform) !== "win32" ||
				(this.deps.arch ?? process.arch) !== "x64"
			)
				plan.issues.push("platform");
			if (
				!safePath(plan.pythonPath) ||
				!/\.exe$/i.test(plan.pythonPath) ||
				!(await fs.stat(plan.pythonPath).catch(() => null))?.isFile()
			)
				plan.issues.push("python");
			const selected = mode === "reuse" ? this.state.paths.model : this.state.paths.storage;
			if (
				!selected ||
				!safePath(selected) ||
				!(await fs.stat(selected).catch(() => null))?.isDirectory()
			)
				plan.issues.push(mode === "reuse" ? "model" : "storage");
			else {
				const root = await fs.realpath(selected);
				if (!safePath(root)) throw new Error("local-path");
				plan.modelPath =
					mode === "reuse"
						? root
						: path.join(root, `PurplePrint-Voice-${this.model.revision.slice(0, 8)}-${plan.id}`);
				plan.freeBytes = this.deps.space
					? await this.deps.space(root)
					: await fs.statfs(root).then((s) => s.bavail * s.bsize);
				if (plan.freeBytes < plan.requiredFreeBytes) plan.issues.push("space");
			}
			this.baseline = await settings(this.file());
			const existing = JSON.parse(this.baseline ?? "{}");
			if (!existing || Array.isArray(existing) || typeof existing !== "object")
				throw new Error("configuration");
			if (!plan.issues.length) {
				plan.probe = await this.probe(plan.pythonPath, controller.signal);
				if (!plan.probe.ready) plan.issues.push("diagnostic");
				if (mode === "reuse") {
					await this.verify(plan.modelPath, controller.signal);
				}
			}
			controller.signal.throwIfAborted();
			if (this.owner !== owner) throw new Error("closed");
			plan.expiresAt = Date.now() + 15 * 60_000;
			this.plan = plan;
			this.state = { ...this.state, phase: "review", plan };
		} catch (e) {
			this.state = {
				...this.state,
				phase: controller.signal.aborted ? "cancelled" : "error",
				error: controller.signal.aborted
					? undefined
					: e instanceof Error &&
							["model-integrity", "configuration", "local-path"].includes(e.message)
						? e.message
						: "diagnostic",
			};
		} finally {
			this.controller = null;
		}
		return structuredClone(this.state);
	}
	async install(owner: number, id: string) {
		if (
			this.owner !== owner ||
			!this.plan ||
			this.plan.id !== id ||
			this.plan.expiresAt < Date.now() ||
			this.plan.issues.length ||
			this.controller
		)
			throw new Error("invalid-plan");
		const plan = this.plan;
		this.plan = null;
		const controller = new AbortController();
		this.controller = controller;
		let stage: string | null = null;
		let configTemp: string | null = null;
		this.state = {
			...this.state,
			phase: plan.mode === "download" ? "installing" : "verifying",
			error: undefined,
			receivedBytes: 0,
		};
		try {
			if ((await settings(this.file())) !== this.baseline) throw new Error("configuration-changed");
			if (plan.mode === "download") {
				const parent = path.dirname(plan.modelPath);
				if ((await fs.realpath(parent)) !== parent) throw new Error("storage-changed");
				const free = this.deps.space
					? await this.deps.space(parent)
					: await fs.statfs(parent).then((s) => s.bavail * s.bsize);
				if (free < plan.requiredFreeBytes) throw new Error("space");
				if (await fs.stat(plan.modelPath).catch(() => null)) throw new Error("destination-exists");
				stage = await fs.mkdtemp(path.join(parent, ".ppstudio-voice-"));
				let completed = 0;
				for (const item of this.model.files) {
					controller.signal.throwIfAborted();
					if (
						item.path.split("/").some((p) => !p || p === ".." || p === ".") ||
						path.isAbsolute(item.path)
					)
						throw new Error("manifest");
					const file = path.join(stage, item.path);
					await fs.mkdir(path.dirname(file), { recursive: true });
					const url = `https://huggingface.co/${this.model.repository}/resolve/${this.model.revision}/${item.path}`;
					await (this.deps.download ?? downloadModelFile)(
						url,
						file,
						item.bytes,
						item.sha256,
						controller.signal,
						(received) => {
							this.state.receivedBytes = completed + received;
						},
					);
					completed += item.bytes;
				}
				this.state.phase = "verifying";
				await this.verify(stage, controller.signal);
				controller.signal.throwIfAborted();
				if (await fs.stat(plan.modelPath).catch(() => null)) throw new Error("destination-exists");
				await fs.rename(stage, plan.modelPath);
				stage = null;
			} else await this.verify(plan.modelPath, controller.signal);
			controller.signal.throwIfAborted();
			if (this.owner !== owner || (await settings(this.file())) !== this.baseline)
				throw new Error("configuration-changed");
			const config = {
				...JSON.parse(this.baseline ?? "{}"),
				pythonPath: plan.pythonPath,
				presetModel: plan.modelPath,
			};
			await fs.mkdir(this.deps.profile, { recursive: true });
			configTemp = `${this.file()}.${randomUUID()}.tmp`;
			await fs.writeFile(configTemp, JSON.stringify(config, null, 2) + "\n", {
				flag: "wx",
				mode: 0o600,
			});
			controller.signal.throwIfAborted();
			if ((await settings(this.file())) !== this.baseline) throw new Error("configuration-changed");
			await fs.rename(configTemp, this.file());
			configTemp = null;
			this.state = {
				...this.state,
				phase: "complete",
				paths: { ...this.state.paths, model: plan.modelPath },
			};
		} catch (e) {
			const known = [
				"configuration-changed",
				"storage-changed",
				"space",
				"destination-exists",
				"model-integrity",
				"download-origin",
				"download-redirect",
				"download-http",
				"download-size",
				"download-integrity",
			];
			this.state = {
				...this.state,
				phase: controller.signal.aborted ? "cancelled" : "error",
				error: controller.signal.aborted
					? undefined
					: e instanceof Error && known.includes(e.message)
						? e.message
						: "install-failed",
			};
		} finally {
			try {
				if (configTemp) await fs.unlink(configTemp);
				// Only this attempt's freshly created sibling is removed; existing models are never cleanup targets.
				if (
					stage &&
					path.dirname(stage) === path.dirname(plan.modelPath) &&
					path.basename(stage).startsWith(".ppstudio-voice-")
				)
					await fs.rm(stage, { recursive: true, force: true });
			} catch {
				this.state = { ...this.state, phase: "error", error: "cleanup-failed" };
			} finally {
				this.controller = null;
			}
		}
		return structuredClone(this.state);
	}
}
