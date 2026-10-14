import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
	NARRATION_FIELDS,
	type NarrationField,
	type SetupField,
	type SetupKind,
	type SetupSection,
	type StudioSetupReply,
	type StudioSetupSnapshot,
} from "../../src/lib/studio-setup";
import { loadRuntime } from "../hyperframes/runtime";

const localPath = z
	.string()
	.max(4096)
	.refine((value) => path.isAbsolute(value) && !/^(?:\\\\|\/\/)/.test(value));
const narrationConfig = z
	.object({
		pythonPath: localPath,
		presetModel: localPath,
		cloneModel: localPath,
		whisperModel: localPath,
	})
	.strict();
const motionConfig = z.object({ runtimeDir: localPath }).strict();

async function readConfig(file: string): Promise<string | null> {
	try {
		if ((await fs.stat(file)).size > 16_384) throw new Error("Configuration too large");
		return await fs.readFile(file, "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
}
export async function resolveHyperframesDirectory(
	profile: string,
	fallback: string,
	override?: string,
): Promise<string> {
	if (override) return override;
	const raw = await readConfig(path.join(profile, "hyperframes-runtime.json"));
	return raw === null ? fallback : motionConfig.parse(JSON.parse(raw)).runtimeDir;
}

interface Dependencies {
	profile: string;
	narrationFile: string;
	narrationScriptDir: string;
	narrationOverride: boolean;
	hyperframesFallback: string;
	hyperframesOverride?: string;
	ffmpeg: () => string | null;
	findCli: (kind: "codex" | "claude") => string;
	platform?: NodeJS.Platform;
}
interface Draft {
	paths: Partial<Record<SetupField, string>>;
	baseline: Record<SetupKind, string | null>;
	initialPaths: Partial<Record<SetupField, string>>;
	configErrors: Set<SetupKind>;
}
export class StudioSetupService {
	private drafts = new Map<number, Draft>();
	private saving = false;
	constructor(private deps: Dependencies) {}
	reset(owner: number) {
		this.drafts.delete(owner);
	}
	private configFile(kind: SetupKind) {
		return kind === "narration"
			? this.deps.narrationFile
			: path.join(this.deps.profile, "hyperframes-runtime.json");
	}
	private readOnly(kind: SetupKind) {
		return kind === "narration" ? this.deps.narrationOverride : !!this.deps.hyperframesOverride;
	}
	private async draft(owner: number): Promise<Draft> {
		const existing = this.drafts.get(owner);
		if (existing) return existing;
		const draft: Draft = {
			paths: {},
			baseline: { narration: null, hyperframes: null },
			initialPaths: {},
			configErrors: new Set(),
		};
		// IPC serializes operations per owner, including the native picker.
		for (const kind of ["narration", "hyperframes"] as const) {
			try {
				const raw = await readConfig(this.configFile(kind));
				draft.baseline[kind] = raw;
				if (kind === "narration" && raw !== null)
					Object.assign(draft.paths, narrationConfig.parse(JSON.parse(raw)));
				if (kind === "hyperframes")
					draft.paths.hyperframesDir =
						this.deps.hyperframesOverride ||
						(raw === null
							? this.deps.hyperframesFallback
							: motionConfig.parse(JSON.parse(raw)).runtimeDir);
			} catch {
				draft.configErrors.add(kind);
			}
		}
		draft.initialPaths = { ...draft.paths };
		this.drafts.set(owner, draft);
		return draft;
	}
	private fields(kind: SetupKind): readonly SetupField[] {
		return kind === "narration" ? NARRATION_FIELDS : ["hyperframesDir"];
	}
	private async inspect(kind: SetupKind, draft: Draft): Promise<SetupSection> {
		const fields = this.fields(kind);
		const paths = Object.fromEntries(
			fields.filter((field) => draft.paths[field]).map((field) => [field, draft.paths[field]]),
		);
		const section: SetupSection = {
			paths,
			issues: {},
			configured: draft.baseline[kind] !== null || this.readOnly(kind),
			valid: true,
			changed: fields.some((field) => draft.paths[field] !== draft.initialPaths[field]),
			readOnly: this.readOnly(kind),
		};
		if (draft.configErrors.has(kind)) section.issues.configuration = "invalid";
		for (const field of fields) {
			const value = draft.paths[field];
			if (!value) {
				section.issues[field] = "missing";
				continue;
			}
			if (!localPath.safeParse(value).success) {
				section.issues[field] = "invalid";
				continue;
			}
			try {
				if (field === "hyperframesDir") {
					await loadRuntime(value);
					continue;
				}
				if (field === "pythonPath") {
					if (
						!(await fs.stat(value)).isFile() ||
						/\.(cmd|bat|ps1|[cm]?js|sh)$/i.test(value) ||
						((this.deps.platform ?? process.platform) === "win32" && !/\.exe$/i.test(value))
					)
						throw new Error("Choose a native executable");
					continue;
				}
				const weight = await fs.stat(
					path.join(value, field === "whisperModel" ? "model.bin" : "model.safetensors"),
				);
				if (!weight.isFile() || weight.size === 0) throw new Error("Missing model weights");
				section.weightBytes = (section.weightBytes ?? 0) + weight.size;
				if (field !== "whisperModel") {
					const config = JSON.parse((await readConfig(path.join(value, "config.json"))) ?? "null");
					if (config?.tts_model_type !== (field === "presetModel" ? "custom_voice" : "base"))
						throw new Error("Wrong model type");
					if (!(await fs.stat(path.join(value, "speech_tokenizer"))).isDirectory())
						throw new Error("Missing speech tokenizer");
				}
			} catch {
				section.issues[field] = "invalid";
			}
		}
		if (kind === "narration") {
			try {
				await fs.access(path.join(this.deps.narrationScriptDir, "generate.py"));
				await fs.access(path.join(this.deps.narrationScriptDir, "transcribe.py"));
				if (!this.deps.ffmpeg()) throw new Error("Missing FFmpeg");
			} catch {
				section.issues.configuration = "unavailable";
			}
		}
		section.valid = Object.keys(section.issues).length === 0;
		return section;
	}
	async status(owner: number): Promise<StudioSetupSnapshot> {
		const draft = await this.draft(owner);
		const detect = (kind: "codex" | "claude") => {
			try {
				return { found: true, path: this.deps.findCli(kind) };
			} catch {
				return { found: false };
			}
		};
		return {
			cli: { codex: detect("codex"), claude: detect("claude") },
			narration: await this.inspect("narration", draft),
			hyperframes: await this.inspect("hyperframes", draft),
		};
	}
	async pick(
		owner: number,
		field: SetupField,
		choose: () => Promise<string | null>,
	): Promise<StudioSetupReply> {
		const kind = field === "hyperframesDir" ? "hyperframes" : "narration";
		const draft = await this.draft(owner);
		if (this.readOnly(kind)) return { snapshot: await this.status(owner), result: "readonly" };
		const selected = await choose();
		if (this.drafts.get(owner) !== draft) throw new Error("Setup session closed");
		if (!selected) return { snapshot: await this.status(owner), result: "cancelled" };
		if (!localPath.safeParse(selected).success)
			return { snapshot: await this.status(owner), result: "invalid" };
		draft.paths[field] = selected;
		draft.configErrors.delete(kind);
		return { snapshot: await this.status(owner) };
	}
	async save(owner: number, kind: SetupKind): Promise<StudioSetupReply> {
		const draft = await this.draft(owner);
		if (this.readOnly(kind)) return { snapshot: await this.status(owner), result: "readonly" };
		if (this.saving) return { snapshot: await this.status(owner), result: "conflict" };
		this.saving = true;
		const file = this.configFile(kind),
			temporary = `${file}.${randomUUID()}.tmp`;
		let result: StudioSetupReply["result"] = "failed";
		try {
			if (!(await this.inspect(kind, draft)).valid) result = "invalid";
			else if ((await readConfig(file)) !== draft.baseline[kind]) result = "conflict";
			else {
				const config =
					kind === "narration"
						? narrationConfig.parse(
								Object.fromEntries(
									NARRATION_FIELDS.map((field: NarrationField) => [field, draft.paths[field]]),
								),
							)
						: motionConfig.parse({ runtimeDir: draft.paths.hyperframesDir });
				const data = `${JSON.stringify(config, null, 2)}\n`;
				await fs.mkdir(path.dirname(file), { recursive: true });
				await fs.writeFile(temporary, data, { flag: "wx", mode: 0o600 });
				if (this.drafts.get(owner) !== draft || (await readConfig(file)) !== draft.baseline[kind])
					result = "conflict";
				else {
					await fs.rename(temporary, file);
					draft.baseline[kind] = data;
					for (const field of this.fields(kind)) draft.initialPaths[field] = draft.paths[field];
					result = "saved";
				}
			}
		} catch {
			result = "failed";
		} finally {
			await fs.unlink(temporary).catch(() => undefined);
			this.saving = false;
		}
		return { snapshot: await this.status(owner), result };
	}
}
