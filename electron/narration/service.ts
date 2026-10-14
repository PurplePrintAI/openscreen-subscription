import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
	type NarrationInput,
	type NarrationStatus,
	narrationInputSchema,
	narrationTakeSchema,
	narrationToneInstruction,
	resolveNarrationTone,
} from "../../src/lib/narration";
import { runLocal } from "../hyperframes/runtime";

const runtimeSchema = z.object({
	pythonPath: z.string(),
	cloneModel: z.string(),
	presetModel: z.string(),
	whisperModel: z.string(),
});
interface Dependencies {
	root: string;
	runtimeFile: string;
	scriptDir: string;
	ffmpeg: () => string | null;
	run?: typeof runLocal;
}
export function narrationEnvironment(): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { APP_ROOT: "", VITE_PUBLIC: "" };
	for (const key of [
		"PATH",
		"Path",
		"PATHEXT",
		"SystemRoot",
		"WINDIR",
		"TEMP",
		"TMP",
		"USERPROFILE",
		"LOCALAPPDATA",
		"APPDATA",
	])
		if (process.env[key]) env[key] = process.env[key];
	return {
		...env,
		PYTHONIOENCODING: "utf-8",
		HF_HUB_OFFLINE: "1",
		TRANSFORMERS_OFFLINE: "1",
		HF_HUB_DISABLE_TELEMETRY: "1",
		GRADIO_ANALYTICS_ENABLED: "False",
	};
}
export class NarrationService {
	private state: NarrationStatus = { phase: "idle", runtime: { available: false } };
	private controller: AbortController | null = null;
	private references = new Map<string, string>();
	constructor(private deps: Dependencies) {}
	private async runtime() {
		const config = runtimeSchema.parse(
			JSON.parse(await fs.readFile(this.deps.runtimeFile, "utf8")),
		);
		for (const [key, value] of Object.entries(config)) {
			if (!path.isAbsolute(value))
				throw new Error(`Runtime ${key} must be an absolute local path.`);
			const file =
				key === "pythonPath"
					? value
					: path.join(value, key === "whisperModel" ? "model.bin" : "model.safetensors");
			if (!(await fs.stat(file)).isFile()) throw new Error(`Missing ${key}`);
		}
		if (!this.deps.ffmpeg()) throw new Error("FFmpeg is unavailable.");
		await fs.access(path.join(this.deps.scriptDir, "generate.py"));
		return config;
	}
	async status(): Promise<NarrationStatus> {
		if (!this.controller) {
			try {
				const runtime = await this.runtime();
				this.state.runtime = {
					available: true,
					...(await this.toneCapability(runtime.presetModel)),
				};
			} catch {
				this.state.runtime = {
					available: false,
					error:
						"Local narration runtime is not configured. Python, Qwen3-TTS models and a CUDA GPU are required. No automatic download.",
				};
			}
		}
		return structuredClone(this.state);
	}
	private async toneCapability(model: string) {
		try {
			const config = z
				.object({ tts_model_type: z.string(), tts_model_size: z.string().max(20) })
				.parse(JSON.parse(await fs.readFile(path.join(model, "config.json"), "utf8")));
			return {
				presetToneControl:
					config.tts_model_type === "custom_voice" && config.tts_model_size === "1b7",
				presetModelSize: config.tts_model_size,
			};
		} catch {
			return { presetToneControl: false };
		}
	}
	cancel() {
		this.controller?.abort();
	}
	private async job(
		phase: "reference" | "generating",
		work: (folder: string, signal: AbortSignal) => Promise<void>,
	) {
		if (this.controller) throw new Error("A narration job is already running.");
		const controller = new AbortController();
		this.controller = controller;
		this.state = { ...this.state, phase, take: undefined, error: undefined };
		try {
			const folder = path.join(this.deps.root, randomUUID());
			await fs.mkdir(folder, { recursive: true });
			await work(folder, controller.signal);
			controller.signal.throwIfAborted();
			this.state.phase = this.state.take ? "ready" : "idle";
		} catch (error) {
			this.state.phase = controller.signal.aborted ? "cancelled" : "error";
			this.state.error = controller.signal.aborted ? undefined : String(error).slice(-2000);
			this.state.take = undefined;
		} finally {
			this.controller = null;
		}
		return this.status();
	}
	async prepareReference(file: string) {
		return this.job("reference", async (folder, signal) => {
			const runtime = await this.runtime();
			if (
				!path.isAbsolute(file) ||
				![".wav", ".flac", ".m4a", ".mp3"].includes(path.extname(file).toLowerCase())
			)
				throw new Error("Choose a local audio file.");
			const stat = await fs.stat(file);
			if (!stat.isFile() || stat.size > 25 * 1024 * 1024)
				throw new Error("Reference must be below 25 MiB.");
			const run = this.deps.run ?? runLocal,
				env = narrationEnvironment();
			const wav = path.join(folder, "reference.wav");
			await run(
				this.deps.ffmpeg()!,
				[
					"-v",
					"error",
					"-nostdin",
					"-protocol_whitelist",
					"file,pipe",
					"-i",
					file,
					"-t",
					"31",
					"-ac",
					"1",
					"-ar",
					"24000",
					"-c:a",
					"pcm_s16le",
					wav,
				],
				folder,
				env,
				signal,
				60000,
			);
			const result = path.join(folder, "reference.json");
			await run(
				runtime.pythonPath,
				[
					path.join(this.deps.scriptDir, "transcribe.py"),
					"--model",
					runtime.whisperModel,
					"--audio",
					wav,
					"--output",
					result,
				],
				folder,
				env,
				signal,
				180000,
			);
			const data = z
				.object({ text: z.string().min(1), durationSec: z.number().min(3).max(30) })
				.parse(JSON.parse(await fs.readFile(result, "utf8")));
			signal.throwIfAborted();
			const id = randomUUID();
			this.references.set(id, wav);
			this.state.reference = { id, label: path.basename(file), text: data.text };
		});
	}
	async generate(raw: NarrationInput) {
		const input = narrationInputSchema.parse(raw);
		return this.job("generating", async (folder, signal) => {
			const runtime = await this.runtime(),
				run = this.deps.run ?? runLocal;
			let job: Record<string, unknown> = { mode: input.mode, text: input.text };
			const tone = input.mode === "preset" ? resolveNarrationTone(input.tone) : undefined;
			const instruct = tone ? narrationToneInstruction(tone) : "";
			if (tone) {
				if (instruct && !(await this.toneCapability(runtime.presetModel)).presetToneControl)
					throw new Error(
						"Tone control requires local Qwen3-TTS 1.7B CustomVoice. Configure it or select the original tone without extra direction.",
					);
				job.instruct = instruct;
			}
			if (input.mode === "clone") {
				const file = this.references.get(input.referenceId);
				if (!file) throw new Error("Choose the reference recording again.");
				job = {
					...job,
					referenceAudio: file,
					referenceText: input.referenceText,
					speakerConsent: input.speakerConsent,
				};
			}
			const jobFile = path.join(folder, "job.json"),
				rawWav = path.join(folder, "raw.wav");
			await fs.writeFile(jobFile, JSON.stringify(job));
			await run(
				runtime.pythonPath,
				[
					path.join(this.deps.scriptDir, "generate.py"),
					"--runtime",
					this.deps.runtimeFile,
					"--job",
					jobFile,
					"--output",
					rawWav,
				],
				folder,
				narrationEnvironment(),
				signal,
				900000,
			);
			signal.throwIfAborted();
			this.state.phase = "verifying";
			const meta = z
				.object({
					durationSec: z.number().positive().max(140),
					instruction: z.string().optional(),
					model: z.string().max(200).optional(),
				})
				.parse(JSON.parse(await fs.readFile(path.join(folder, "raw.json"), "utf8")));
			if (tone && meta.instruction !== instruct)
				throw new Error(
					"Narration worker did not confirm the requested tone. Update the local worker before applying this take.",
				);
			const audioPath = path.join(folder, "narration.wav");
			await run(
				this.deps.ffmpeg()!,
				[
					"-v",
					"error",
					"-nostdin",
					"-i",
					rawWav,
					"-af",
					"loudnorm=I=-16:TP=-1.5:LRA=11",
					"-ar",
					"48000",
					"-c:a",
					"pcm_s16le",
					audioPath,
				],
				folder,
				narrationEnvironment(),
				signal,
				60000,
			);
			await run(
				this.deps.ffmpeg()!,
				["-v", "error", "-i", audioPath, "-f", "null", "-"],
				folder,
				narrationEnvironment(),
				signal,
				60000,
			);
			signal.throwIfAborted();
			this.state.take = narrationTakeSchema.parse({
				jobId: path.basename(folder),
				projectId: input.projectId,
				mode: input.mode,
				text: input.text,
				audioPath,
				durationSec: meta.durationSec,
				...(tone ? { tone } : {}),
				...(meta.model ? { model: meta.model } : {}),
			});
			await fs.writeFile(path.join(folder, "take.json"), JSON.stringify(this.state.take, null, 2));
		});
	}
}
