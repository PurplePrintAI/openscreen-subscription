import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { GSAP_VERSION, HYPERFRAMES_VERSION } from "../../src/lib/hyperframes";
import { NARRATION_FIELDS, studioSetupRequestSchema } from "../../src/lib/studio-setup";
import { resolveHyperframesDirectory, StudioSetupService } from "./service";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("studio-setup-"))
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture(overrides = false) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-setup-"));
	roots.push(root);
	const config = {
		pythonPath: path.join(root, "python.exe"),
		presetModel: path.join(root, "preset"),
		cloneModel: path.join(root, "clone"),
		whisperModel: path.join(root, "whisper"),
	};
	await fs.writeFile(config.pythonPath, "not executed");
	for (const name of ["generate.py", "transcribe.py"])
		await fs.writeFile(path.join(root, name), "not executed");
	for (const field of NARRATION_FIELDS) {
		if (field === "pythonPath") continue;
		await fs.mkdir(config[field]);
		await fs.writeFile(
			path.join(config[field], field === "whisperModel" ? "model.bin" : "model.safetensors"),
			"weights",
		);
		if (field !== "whisperModel") {
			await fs.mkdir(path.join(config[field], "speech_tokenizer"));
			await fs.writeFile(
				path.join(config[field], "config.json"),
				JSON.stringify({ tts_model_type: field === "presetModel" ? "custom_voice" : "base" }),
			);
		}
	}
	const file = path.join(root, "profile/narration-runtime.json");
	const deps = {
		profile: path.dirname(file),
		narrationFile: file,
		narrationScriptDir: root,
		narrationOverride: overrides,
		hyperframesFallback: path.join(root, "motion-missing"),
		ffmpeg: () => "ffmpeg",
		findCli: (kind: string) => {
			if (kind === "claude") throw new Error("not installed");
			return path.join(root, "codex.exe");
		},
	};
	const service = new StudioSetupService(deps);
	async function select(owner = 1) {
		for (const field of NARRATION_FIELDS)
			await service.pick(owner, field, async () => config[field]);
	}
	return { root, file, config, service, deps, select };
}
it("discovery is read-only; picker selections require a separate save and survive restart", async () => {
	const f = await fixture();
	expect((await f.service.status(1)).cli).toMatchObject({
		codex: { found: true },
		claude: { found: false },
	});
	await expect(fs.stat(path.dirname(f.file))).rejects.toThrow();
	await f.select();
	expect((await f.service.status(1)).narration).toMatchObject({
		valid: true,
		changed: true,
		weightBytes: 21,
	});
	await expect(fs.stat(f.file)).rejects.toThrow();
	expect((await f.service.save(1, "narration")).result).toBe("saved");
	expect(JSON.parse(await fs.readFile(f.file, "utf8"))).toEqual(f.config);
	expect((await new StudioSetupService(f.deps).status(2)).narration).toMatchObject({
		valid: true,
		changed: false,
		configured: true,
		paths: f.config,
	});
});
it("rejects wrong model roles and revalidates removed files without replacing saved configuration", async () => {
	const f = await fixture();
	await f.select();
	await f.service.save(1, "narration");
	const before = await fs.readFile(f.file, "utf8");
	await f.service.pick(1, "presetModel", async () => f.config.cloneModel);
	expect((await f.service.save(1, "narration")).result).toBe("invalid");
	await f.service.pick(1, "presetModel", async () => f.config.presetModel);
	await fs.unlink(path.join(f.config.presetModel, "model.safetensors"));
	expect((await f.service.save(1, "narration")).result).toBe("invalid");
	expect(await fs.readFile(f.file, "utf8")).toBe(before);
});
it("does not overwrite a configuration changed by another owner", async () => {
	const f = await fixture();
	await f.select(1);
	await f.select(2);
	expect((await f.service.save(1, "narration")).result).toBe("saved");
	expect((await f.service.save(2, "narration")).result).toBe("conflict");
});
it("native cancel preserves the draft; closing invalidates a pending selection", async () => {
	const f = await fixture();
	await f.select();
	expect((await f.service.pick(1, "pythonPath", async () => null)).result).toBe("cancelled");
	let resolve: (value: string) => void = () => {
		throw new Error("picker not started");
	};
	const choose = vi.fn(
		() =>
			new Promise<string>((r) => {
				resolve = r;
			}),
	);
	const pending = f.service.pick(1, "pythonPath", choose);
	await vi.waitFor(() => expect(choose).toHaveBeenCalled());
	f.service.reset(1);
	resolve(f.config.pythonPath);
	await expect(pending).rejects.toThrow("closed");
	expect((await f.service.status(1)).narration.paths).toEqual({});
});
it("refuses renderer paths, unacknowledged saves and override writes", async () => {
	expect(
		studioSetupRequestSchema.safeParse({
			action: "pick",
			field: "pythonPath",
			path: "C:/injected.exe",
		}).success,
	).toBe(false);
	expect(
		studioSetupRequestSchema.safeParse({
			action: "save",
			kind: "narration",
			trustLocalRuntime: false,
		}).success,
	).toBe(false);
	const f = await fixture(true),
		choose = vi.fn(async () => f.config.pythonPath);
	expect((await f.service.pick(1, "pythonPath", choose)).result).toBe("readonly");
	expect(choose).not.toHaveBeenCalled();
	expect((await f.service.save(1, "narration")).result).toBe("readonly");
});
it("keeps the app-local motion config below the explicit development override", async () => {
	const f = await fixture();
	expect(await resolveHyperframesDirectory(f.root, "fallback")).toBe("fallback");
	await fs.writeFile(
		path.join(f.root, "hyperframes-runtime.json"),
		JSON.stringify({ runtimeDir: f.root }),
	);
	expect(await resolveHyperframesDirectory(f.root, "fallback")).toBe(f.root);
	expect(await resolveHyperframesDirectory(f.root, "fallback", "override")).toBe("override");
	await fs.writeFile(
		path.join(f.root, "hyperframes-runtime.json"),
		JSON.stringify({ runtimeDir: "relative" }),
	);
	await expect(resolveHyperframesDirectory(f.root, "fallback")).rejects.toThrow();
});

it("validates and persists a prepared motion folder without modifying that runtime", async () => {
	const f = await fixture(),
		motion = path.join(f.root, "prepared-motion");
	for (const [name, version, file] of [
		["hyperframes", HYPERFRAMES_VERSION, "bin/hyperframes.mjs"],
		["gsap", GSAP_VERSION, "dist/gsap.min.js"],
	]) {
		const folder = path.join(motion, "node_modules", name);
		await fs.mkdir(path.dirname(path.join(folder, file)), { recursive: true });
		await fs.writeFile(path.join(folder, "package.json"), JSON.stringify({ version }));
		await fs.writeFile(path.join(folder, file), "never executed");
	}
	const runtime = JSON.stringify({
		nodePath: f.config.pythonPath,
		browserPath: f.config.pythonPath,
		ffmpegPath: f.config.pythonPath,
		ffprobePath: f.config.pythonPath,
	});
	await fs.writeFile(path.join(motion, "local-runtime.json"), runtime);
	await f.service.pick(1, "hyperframesDir", async () => motion);
	expect((await f.service.save(1, "hyperframes")).result).toBe("saved");
	expect(await resolveHyperframesDirectory(f.deps.profile, "fallback")).toBe(motion);
	expect(await fs.readFile(path.join(motion, "local-runtime.json"), "utf8")).toBe(runtime);
	await fs.writeFile(
		path.join(motion, "node_modules/hyperframes/package.json"),
		JSON.stringify({ version: "unapproved" }),
	);
	expect((await f.service.status(1)).hyperframes.valid).toBe(false);
});
