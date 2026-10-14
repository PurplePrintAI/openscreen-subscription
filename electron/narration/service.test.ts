import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { narrationToneInstruction } from "../../src/lib/narration";
import type { runLocal } from "../hyperframes/runtime";
import { NarrationService, narrationEnvironment } from "./service";

const roots: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("studio-narration-"))
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture(run?: typeof runLocal) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-narration-"));
	roots.push(root);
	const runtime = {
		pythonPath: path.join(root, "python"),
		cloneModel: path.join(root, "clone"),
		presetModel: path.join(root, "preset"),
		whisperModel: path.join(root, "whisper"),
	};
	await fs.writeFile(runtime.pythonPath, "");
	await fs.writeFile(path.join(root, "generate.py"), "");
	for (const [key, dir] of Object.entries(runtime)) {
		if (key === "pythonPath") continue;
		await fs.mkdir(dir);
		await fs.writeFile(
			path.join(dir, key === "whisperModel" ? "model.bin" : "model.safetensors"),
			"",
		);
	}
	const runtimeFile = path.join(root, "runtime.json");
	await fs.writeFile(
		path.join(runtime.presetModel, "config.json"),
		JSON.stringify({ tts_model_type: "custom_voice", tts_model_size: "1b7" }),
	);
	await fs.writeFile(runtimeFile, JSON.stringify(runtime));
	const calls: string[][] = [];
	const mock: typeof runLocal = async (_exe, args, cwd, _env, signal) => {
		signal.throwIfAborted();
		calls.push(args);
		if (args[0].endsWith("generate.py")) {
			const job = JSON.parse(await fs.readFile(path.join(cwd, "job.json"), "utf8"));
			await fs.writeFile(
				path.join(cwd, "raw.json"),
				JSON.stringify({
					durationSec: 6,
					instruction: job.instruct ?? "",
					model: "fixture-custom-1.7b",
				}),
			);
		}
		return "";
	};
	return {
		root,
		calls,
		service: new NarrationService({
			root: path.join(root, "jobs"),
			runtimeFile,
			scriptDir: root,
			ffmpeg: () => "ffmpeg",
			run: run ?? mock,
		}),
	};
}
it("preset never reads a reference and yields only a verified take", async () => {
	const { root, service, calls } = await fixture();
	const result = await service.generate({ mode: "preset", projectId: "qa", text: "한국어" });
	expect(result.phase).toBe("ready");
	expect(result.take?.projectId).toBe("qa");
	expect(calls).toHaveLength(3);
	const job = JSON.parse(
		await fs.readFile(path.join(root, "jobs", result.take!.jobId, "job.json"), "utf8"),
	);
	expect(job).toEqual({
		mode: "preset",
		text: "한국어",
		instruct: narrationToneInstruction({ preset: "confident" }),
	});
	expect(result.take).toMatchObject({
		tone: { preset: "confident" },
		model: "fixture-custom-1.7b",
	});
});
it("persists custom direction with the generated take and confirms the worker used it", async () => {
	const { root, service } = await fixture();
	const tone = { preset: "bright" as const, direction: "말끝을 또렷하게" };
	const result = await service.generate({ mode: "preset", projectId: "qa", text: "대본", tone });
	expect(result.take?.tone).toEqual(tone);
	const job = JSON.parse(
		await fs.readFile(path.join(root, "jobs", result.take!.jobId, "job.json"), "utf8"),
	);
	expect(job.instruct).toBe(narrationToneInstruction(tone));
});
it("does not silently ignore style on 0.6B, but preserves original-tone generation", async () => {
	const { root, service, calls } = await fixture();
	await fs.writeFile(
		path.join(root, "preset", "config.json"),
		JSON.stringify({ tts_model_type: "custom_voice", tts_model_size: "0b6" }),
	);
	expect((await service.status()).runtime.presetToneControl).toBe(false);
	expect((await service.generate({ mode: "preset", projectId: "qa", text: "대본" })).phase).toBe(
		"error",
	);
	expect(calls).toHaveLength(0);
	expect(
		(
			await service.generate({
				mode: "preset",
				projectId: "qa",
				text: "대본",
				tone: { preset: "neutral" },
			})
		).phase,
	).toBe("ready");
});
it("rejects a stale worker that cannot confirm the applied tone", async () => {
	const { service } = await fixture(async (_exe, args, cwd) => {
		if (args[0].endsWith("generate.py"))
			await fs.writeFile(path.join(cwd, "raw.json"), JSON.stringify({ durationSec: 6 }));
		return "";
	});
	const result = await service.generate({ mode: "preset", projectId: "qa", text: "대본" });
	expect(result.phase).toBe("error");
	expect(result.take).toBeUndefined();
	expect(result.error).toContain("did not confirm");
});
it("unknown clone reference fails without spawning a model", async () => {
	const { service, calls } = await fixture();
	const result = await service.generate({
		mode: "clone",
		projectId: "qa",
		text: "대본",
		referenceId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
		referenceText: "원본",
		speakerConsent: true,
	});
	expect(result.phase).toBe("error");
	expect(result.take).toBeUndefined();
	expect(calls).toHaveLength(0);
});
it("locks before awaits and cancellation cannot produce an applicable take", async () => {
	let entered!: () => void;
	const ready = new Promise<void>((r) => {
		entered = r;
	});
	const { service } = await fixture(async (_exe, _args, _cwd, _env, signal) => {
		entered();
		await new Promise<void>((_r, reject) =>
			signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true }),
		);
		return "";
	});
	const first = service.generate({ mode: "preset", projectId: "qa", text: "대본" });
	await ready;
	await expect(
		service.generate({ mode: "preset", projectId: "qa", text: "다른 대본" }),
	).rejects.toThrow("already running");
	service.cancel();
	expect((await first).phase).toBe("cancelled");
	expect((await service.status()).take).toBeUndefined();
});
it("does not inherit credentials or allow online model fetches", () => {
	vi.stubEnv("OPENAI_API_KEY", "not-a-real-key");
	vi.stubEnv("HF_TOKEN", "not-a-real-token");
	const env = narrationEnvironment();
	expect(env.OPENAI_API_KEY).toBeUndefined();
	expect(env.HF_TOKEN).toBeUndefined();
	expect(env.HF_HUB_OFFLINE).toBe("1");
});
