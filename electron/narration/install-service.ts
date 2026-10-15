import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { narrationToneInstruction } from "../../src/lib/narration";
import type {
	VoiceInstallPlan,
	VoiceInstallStatus,
	VoiceProbe,
} from "../../src/lib/narration-install";
import { runLocal } from "../hyperframes/runtime";
import { downloadModelFile } from "./install-download";
import {
	detectVoiceHardware,
	installManagedRuntime,
	managedDownloadBytes,
	managedEnvironment,
	managedRuntimeManifest,
} from "./managed-runtime";
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
	hardware?: typeof detectVoiceHardware;
	provision?: typeof installManagedRuntime;
	smoke?: (
		python: string,
		model: string,
		root: string,
		signal: AbortSignal,
	) => Promise<{ audioPath: string; durationSec: number }>;
}
const safePath = (p: string) => path.isAbsolute(p) && !/^(?:\\\\|\/\/)/.test(p);
async function removeOwnedRuntime(root: string, expected: string, id: string) {
	if (
		(await fs.realpath(root)) !== root ||
		root !== expected ||
		path.basename(root) !== `PurplePrint-Runtime-${id}`
	)
		throw new Error("Unsafe runtime cleanup");
	await fs.rm(root, { recursive: true, force: true });
}
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
	private probeReport: string | null = null;
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
		if (this.probeReport) {
			try {
				if ((await fs.stat(this.probeReport)).size <= 4096) {
					const report = JSON.parse(await fs.readFile(this.probeReport, "utf8"));
					const stage = z
						.enum(["import-soundfile", "import-torch", "import-qwen", "cuda"])
						.safeParse(report.stage);
					if (stage.success) this.state.diagnosticStage = stage.data;
				}
			} catch {
				/* Polling can race a report write; retain the last observed stage. */
			}
		}
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
			for await (const chunk of createReadStream(file, { signal, highWaterMark: 1024 * 1024 }))
				hash.update(chunk);
			if (hash.digest("hex") !== item.sha256) throw new Error("model-integrity");
		}
	}
	private async probe(
		python: string,
		signal: AbortSignal,
		timeoutMs = 90_000,
	): Promise<VoiceProbe> {
		if (this.deps.probe) return this.deps.probe(python, signal);
		const folder = path.join(this.deps.profile, "narration-diagnostics");
		await fs.mkdir(folder, { recursive: true });
		const reportFile = path.join(folder, `probe-${randomUUID()}.json`);
		const env = {
			...narrationEnvironment(),
			// Packaged scripts may live in a read-only install directory.
			PYTHONDONTWRITEBYTECODE: "1",
			TORCH_HOME: folder,
			CUDA_CACHE_PATH: path.join(folder, "cuda"),
			STUDIO_NARRATION_PROBE_REPORT: reportFile,
		};
		this.probeReport = reportFile;
		try {
			const result = await runLocal(
				python,
				[path.join(this.deps.scriptDir, "probe_runtime.py")],
				folder,
				env,
				signal,
				timeoutMs,
			);
			return probeSchema.parse(JSON.parse(result.trim().split(/\r?\n/).at(-1)!));
		} finally {
			this.probeReport = null;
			this.state.diagnosticStage = undefined;
		}
	}
	async prepare(
		owner: number,
		mode: "download" | "reuse",
		runtimeMode: "existing" | "managed" = "existing",
	) {
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
			sample: undefined,
			step: undefined,
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
			runtimeMode,
			runtimeDownloadBytes: runtimeMode === "managed" ? managedDownloadBytes : 0,
		};
		if (runtimeMode === "managed") {
			plan.downloadBytes += managedDownloadBytes;
			plan.requiredFreeBytes = plan.downloadBytes + managedRuntimeManifest.diskHeadroomBytes;
		}
		try {
			if (this.deps.override) plan.issues.push("override");
			if (
				(this.deps.platform ?? process.platform) !== "win32" ||
				(this.deps.arch ?? process.arch) !== "x64"
			)
				plan.issues.push("platform");
			if (
				runtimeMode === "existing" &&
				(!safePath(plan.pythonPath) ||
					!/\.exe$/i.test(plan.pythonPath) ||
					!(await fs.stat(plan.pythonPath).catch(() => null))?.isFile())
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
				if (runtimeMode === "existing" && plan.freeBytes < plan.requiredFreeBytes)
					plan.issues.push("space");
			}
			if (runtimeMode === "managed") {
				const storage = this.state.paths.storage;
				if (
					!storage ||
					!safePath(storage) ||
					!(await fs.stat(storage).catch(() => null))?.isDirectory()
				)
					plan.issues.push("storage");
				else {
					const root = await fs.realpath(storage);
					if (!safePath(root)) throw new Error("local-path");
					plan.runtimeRoot = path.join(root, `PurplePrint-Runtime-${plan.id}`);
					plan.pythonPath = path.join(plan.runtimeRoot, "venv", "Scripts", "python.exe");
					if (mode === "download") plan.modelPath = path.join(plan.runtimeRoot, "model");
					plan.freeBytes = this.deps.space
						? await this.deps.space(root)
						: await fs.statfs(root).then((s) => s.bavail * s.bsize);
					if (plan.freeBytes < plan.requiredFreeBytes) plan.issues.push("space");
				}
			}
			this.baseline = await settings(this.file());
			const existing = JSON.parse(this.baseline ?? "{}");
			if (!existing || Array.isArray(existing) || typeof existing !== "object")
				throw new Error("configuration");
			if (!plan.issues.length) {
				if (runtimeMode === "managed")
					plan.hardware = await (this.deps.hardware ?? detectVoiceHardware)(
						path.join(this.deps.profile, "narration-diagnostics"),
						controller.signal,
					);
				else {
					plan.probe = await this.probe(plan.pythonPath, controller.signal);
					if (!plan.probe.ready) plan.issues.push("diagnostic");
				}
				if (mode === "reuse") {
					await this.verify(plan.modelPath, controller.signal);
				}
			}
			controller.signal.throwIfAborted();
			if (this.owner !== owner) throw new Error("closed");
			// Managed downloads share one storage selection for Python and the model.
			plan.issues = [...new Set(plan.issues)];
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
							[
								"model-integrity",
								"configuration",
								"local-path",
								"gpu",
								"gpu-diagnostic",
								"platform",
							].includes(e.message)
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
		const managed = plan.runtimeMode === "managed";
		this.plan = null;
		const controller = new AbortController();
		this.controller = controller;
		let stage: string | null = null;
		let configTemp: string | null = null;
		let ownedRuntime: string | null = null;
		let connected = false;
		this.state = {
			...this.state,
			phase: plan.mode === "download" ? "installing" : "verifying",
			error: undefined,
			receivedBytes: 0,
		};
		try {
			if ((await settings(this.file())) !== this.baseline) throw new Error("configuration-changed");
			if (managed) {
				if (!plan.runtimeRoot) throw new Error("invalid-plan");
				const parent = path.dirname(plan.runtimeRoot);
				if ((await fs.realpath(parent)) !== parent) throw new Error("storage-changed");
				const free = this.deps.space
					? await this.deps.space(parent)
					: await fs.statfs(parent).then((s) => s.bavail * s.bsize);
				if (free < plan.requiredFreeBytes) throw new Error("space");
				await fs.mkdir(plan.runtimeRoot);
				ownedRuntime = plan.runtimeRoot;
				this.state.phase = "provisioning";
				const python = await (this.deps.provision ?? installManagedRuntime)(
					ownedRuntime,
					this.deps.scriptDir,
					controller.signal,
					(step, received) => {
						this.state.step = step;
						this.state.receivedBytes = received;
					},
				);
				if (python !== plan.pythonPath) throw new Error("runtime-integrity");
				this.state.step = undefined;
				const probe = await this.probe(python, controller.signal, 300_000);
				if (!probe.ready) throw new Error("diagnostic");
			}
			if (plan.mode === "download") {
				const parent = path.dirname(plan.modelPath);
				if ((await fs.realpath(parent)) !== parent) throw new Error("storage-changed");
				const free = this.deps.space
					? await this.deps.space(parent)
					: await fs.statfs(parent).then((s) => s.bavail * s.bsize);
				if (free < (managed ? plan.bytes + 512 * 1024 ** 2 : plan.requiredFreeBytes))
					throw new Error("space");
				if (await fs.stat(plan.modelPath).catch(() => null)) throw new Error("destination-exists");
				stage = await fs.mkdtemp(path.join(parent, ".ppstudio-voice-"));
				this.state.phase = "installing";
				let completed = managed ? managedDownloadBytes : 0;
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
			if (managed && ownedRuntime) {
				this.state.phase = "testing";
				this.state.sample = await this.smoke(
					plan.pythonPath,
					plan.modelPath,
					ownedRuntime,
					controller.signal,
				);
			}
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
			connected = true;
			this.state = {
				...this.state,
				phase: "complete",
				paths: { ...this.state.paths, model: plan.modelPath, python: plan.pythonPath },
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
				"runtime-integrity",
				"runtime-archive",
				"diagnostic",
			];
			if (managed && !controller.signal.aborted) {
				// Preserve bounded local diagnostics even when the owned runtime is cleaned up.
				const folder = path.join(this.deps.profile, "narration-diagnostics");
				await fs
					.mkdir(folder, { recursive: true })
					.then(() =>
						fs.writeFile(
							path.join(folder, `setup-${plan.id}.txt`),
							`${this.state.phase} / ${this.state.step ?? "validation"}\n${e instanceof Error ? e.message.slice(-4000) : "Install failed"}\n`,
							{ flag: "wx", mode: 0o600 },
						),
					)
					.catch(() => undefined);
			}
			this.state = {
				...this.state,
				phase: controller.signal.aborted ? "cancelled" : "error",
				sample: undefined,
				error: controller.signal.aborted
					? undefined
					: e instanceof Error && known.includes(e.message)
						? e.message
						: managed && this.state.step === "installing-packages"
							? "runtime-packages"
							: managed && this.state.phase === "testing"
								? "runtime-test"
								: managed && this.state.phase === "provisioning" && !this.state.step
									? "runtime-diagnostic"
									: "install-failed",
			};
		} finally {
			const cleanup: Array<() => Promise<void>> = [];
			if (configTemp) {
				const file = configTemp;
				cleanup.push(() => fs.unlink(file));
			}
			// Only paths freshly created by this attempt are eligible for cleanup.
			if (
				stage &&
				path.dirname(stage) === path.dirname(plan.modelPath) &&
				path.basename(stage).startsWith(".ppstudio-voice-")
			) {
				const folder = stage;
				cleanup.push(() => fs.rm(folder, { recursive: true, force: true }));
			}
			if (ownedRuntime && !connected) {
				const folder = ownedRuntime;
				cleanup.push(() => removeOwnedRuntime(folder, plan.runtimeRoot!, plan.id));
			}
			for (const clean of cleanup) {
				try {
					await clean();
				} catch {
					this.state = { ...this.state, phase: "error", error: "cleanup-failed" };
				}
			}
			this.controller = null;
		}
		return structuredClone(this.state);
	}
	private async smoke(python: string, model: string, root: string, signal: AbortSignal) {
		if (this.deps.smoke) return this.deps.smoke(python, model, root, signal);
		const config = path.join(root, "validation-runtime.json"),
			job = path.join(root, "validation-job.json"),
			output = path.join(root, "sample.wav");
		await fs.writeFile(config, JSON.stringify({ pythonPath: python, presetModel: model }), {
			flag: "wx",
		});
		await fs.writeFile(
			job,
			JSON.stringify({
				mode: "preset",
				text: "퍼플프린트 스튜디오의 기본 음성을 확인합니다.",
				instruct: narrationToneInstruction({ preset: "confident" }),
			}),
			{ flag: "wx" },
		);
		await runLocal(
			python,
			[
				"-I",
				path.join(this.deps.scriptDir, "generate.py"),
				"--runtime",
				config,
				"--job",
				job,
				"--output",
				output,
			],
			root,
			managedEnvironment(root),
			signal,
			10 * 60_000,
		);
		const result = z
			.object({ durationSec: z.number().positive().max(60) })
			.parse(JSON.parse(await fs.readFile(path.join(root, "sample.json"), "utf8")));
		if ((await fs.stat(output)).size < 100) throw new Error("diagnostic");
		return { audioPath: output, durationSec: result.durationSec };
	}
}
