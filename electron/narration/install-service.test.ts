import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { narrationInstallRequest } from "../../src/lib/narration-install";
import * as localRuntime from "../hyperframes/runtime";
import { NarrationInstallService } from "./install-service";
import manifest from "./preset-manifest.json";

const roots: string[] = [];
afterEach(async () => {
	vi.restoreAllMocks();
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("voice-install-"))
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "voice-install-"));
	roots.push(root);
	const python = path.join(root, "python.exe"),
		profile = path.join(root, "profile"),
		model = path.join(root, "existing");
	await fs.writeFile(python, "not executed");
	await fs.mkdir(profile);
	await fs.mkdir(model);
	const payload = "test weights";
	const pinned = {
		...manifest,
		files: [
			{
				path: "model.safetensors",
				bytes: Buffer.byteLength(payload),
				sha256: createHash("sha256").update(payload).digest("hex"),
			},
		],
	};
	await fs.writeFile(path.join(model, "model.safetensors"), payload);
	const deps = {
		profile,
		scriptDir: root,
		override: false,
		platform: "win32" as const,
		arch: "x64",
		manifest: pinned,
		probe: vi.fn(async () => ({ ready: true, python: "3.12.10", cuda: true, gpu: "fixture" })),
		space: vi.fn(async () => 10 * 1024 ** 3),
		download: vi.fn(async (_url: string, output: string) => {
			await fs.writeFile(output, payload, { flag: "wx" });
		}),
	};
	const service = new NarrationInstallService(deps),
		config = path.join(profile, "narration-runtime.json");
	async function select() {
		await service.pick(1, "python", async () => python);
		await service.pick(1, "storage", async () => root);
		await service.pick(1, "model", async () => model);
	}
	return { root, python, profile, model, deps, service, config, select, payload };
}
it("runs the offline probe without writing bytecode into packaged resources", async () => {
	const f = await fixture();
	const run = vi
		.spyOn(localRuntime, "runLocal")
		.mockResolvedValue(JSON.stringify({ ready: true, python: "3.12.13", cuda: true }));
	const service = new NarrationInstallService({ ...f.deps, probe: undefined });
	await service.pick(1, "python", async () => f.python);
	await service.pick(1, "storage", async () => f.root);
	expect((await service.prepare(1, "download")).plan?.issues).toEqual([]);
	expect(run).toHaveBeenCalledWith(
		await fs.realpath(f.python),
		[path.join(f.root, "probe_runtime.py")],
		expect.any(String),
		expect.objectContaining({ PYTHONDONTWRITEBYTECODE: "1", HF_HUB_OFFLINE: "1" }),
		expect.any(AbortSignal),
		90_000,
	);
});
async function managedFixture() {
	const f = await fixture();
	f.deps.space.mockResolvedValue(30 * 1024 ** 3);
	const provision = vi.fn(async (root: string) => {
		await fs.mkdir(path.join(root, "venv", "Scripts"), { recursive: true });
		const file = path.join(root, "venv", "Scripts", "python.exe");
		await fs.writeFile(file, "new interpreter");
		return file;
	});
	const smoke = vi.fn(async (_python: string, _model: string, root: string) => {
		const audioPath = path.join(root, "sample.wav");
		await fs.writeFile(audioPath, "sample");
		return { audioPath, durationSec: 3 };
	});
	const hardware = vi.fn(async () => ({
		name: "fixture",
		memoryMiB: 8192,
		driver: "test",
		compute: 8.9,
	}));
	const service = new NarrationInstallService({ ...f.deps, provision, smoke, hardware });
	await service.pick(1, "storage", async () => f.root);
	await service.pick(1, "model", async () => f.model);
	return { ...f, service, provision, smoke, hardware };
}
it("plans managed setup without any installed Python and connects only after actual smoke validation", async () => {
	const f = await managedFixture();
	const review = await f.service.prepare(1, "reuse", "managed");
	expect(review.plan?.issues).toEqual([]);
	expect(review.plan!.downloadBytes).toBeGreaterThan(2e9);
	expect(f.provision).not.toHaveBeenCalled();
	expect((await f.service.install(1, review.plan!.id)).phase).toBe("complete");
	expect(f.smoke).toHaveBeenCalledOnce();
	expect(JSON.parse(await fs.readFile(f.config, "utf8"))).toEqual({
		pythonPath: review.plan!.pythonPath,
		presetModel: await fs.realpath(f.model),
	});
	expect(await fs.readFile(f.python, "utf8")).toBe("not executed");
});
it("failed managed setup removes only its new runtime and preserves saved configuration/models", async () => {
	const f = await managedFixture();
	await fs.writeFile(f.config, '{"existing":true}');
	const review = await f.service.prepare(1, "reuse", "managed");
	f.smoke.mockRejectedValueOnce(new Error("GPU allocation failed"));
	expect((await f.service.install(1, review.plan!.id)).phase).toBe("error");
	await expect(fs.stat(review.plan!.runtimeRoot!)).rejects.toThrow();
	expect(await fs.readFile(f.config, "utf8")).toBe('{"existing":true}');
	expect(
		await fs.readFile(
			path.join(f.profile, "narration-diagnostics", `setup-${review.plan!.id}.txt`),
			"utf8",
		),
	).toContain("GPU allocation failed");
	expect(await fs.readFile(path.join(f.model, "model.safetensors"), "utf8")).toBe(f.payload);
});
it("cancellation during managed provisioning cleans up and does not start generation", async () => {
	const f = await managedFixture();
	const review = await f.service.prepare(1, "reuse", "managed");
	f.provision.mockImplementationOnce(async (root) => {
		f.service.cancel(1);
		return path.join(root, "venv", "Scripts", "python.exe");
	});
	expect((await f.service.install(1, review.plan!.id)).phase).toBe("cancelled");
	expect(f.smoke).not.toHaveBeenCalled();
	await expect(fs.stat(f.config)).rejects.toThrow();
	await expect(fs.stat(review.plan!.runtimeRoot!)).rejects.toThrow();
});
it("requires native selections, Python trust, and separate install consent", () => {
	for (const raw of [
		{ action: "plan", mode: "download" },
		{ action: "pick", field: "python", path: "malicious.exe" },
		{ action: "install", planId: "a", confirm: false },
		{ action: "status", url: "https://evil.example" },
	])
		expect(narrationInstallRequest.safeParse(raw).success).toBe(false);
});
it("plans without download/writes, verifies staged bytes, then atomically connects while preserving clone paths", async () => {
	const f = await fixture();
	const old = { cloneModel: "keep-clone", whisperModel: "keep-whisper" };
	await fs.writeFile(f.config, JSON.stringify(old));
	await f.select();
	const review = await f.service.prepare(1, "download");
	expect(review.phase).toBe("review");
	expect(review.plan?.issues).toEqual([]);
	expect(f.deps.download).not.toHaveBeenCalled();
	expect(JSON.parse(await fs.readFile(f.config, "utf8"))).toEqual(old);
	expect(review.plan!.requiredFreeBytes).toBeGreaterThan(review.plan!.downloadBytes);
	const done = await f.service.install(1, review.plan!.id);
	expect(done.phase).toBe("complete");
	expect(f.deps.download).toHaveBeenCalledTimes(1);
	expect(JSON.parse(await fs.readFile(f.config, "utf8"))).toEqual({
		...old,
		pythonPath: await fs.realpath(f.python),
		presetModel: review.plan!.modelPath,
	});
	expect(await fs.readFile(path.join(review.plan!.modelPath, "model.safetensors"), "utf8")).toBe(
		f.payload,
	);
	await expect(f.service.install(1, review.plan!.id)).rejects.toThrow("invalid-plan");
});
it("reuses exact models without download and rejects later corruption", async () => {
	const f = await fixture();
	await f.select();
	let review = await f.service.prepare(1, "reuse");
	expect(review.plan!.downloadBytes).toBe(0);
	expect((await f.service.install(1, review.plan!.id)).phase).toBe("complete");
	expect(f.deps.download).not.toHaveBeenCalled();
	const original = await fs.readFile(f.config, "utf8");
	review = await f.service.prepare(1, "reuse");
	await fs.writeFile(path.join(f.model, "model.safetensors"), "bad");
	expect((await f.service.install(1, review.plan!.id)).error).toBe("model-integrity");
	expect(await fs.readFile(f.config, "utf8")).toBe(original);
});
it("blocks missing runtime, insufficient storage, unsupported platforms and overrides before execution", async () => {
	const f = await fixture();
	expect((await f.service.prepare(1, "download")).plan?.issues).toEqual(
		expect.arrayContaining(["python", "storage"]),
	);
	await f.select();
	f.deps.space.mockResolvedValue(0);
	expect((await f.service.prepare(1, "download")).plan?.issues).toContain("space");
	expect(f.deps.probe).not.toHaveBeenCalled();
	for (const override of [{ override: true }, { platform: "linux" as const }]) {
		const service = new NarrationInstallService({ ...f.deps, ...override });
		expect((await service.prepare(1, "download")).plan?.issues.length).toBeGreaterThan(0);
	}
	expect(f.deps.download).not.toHaveBeenCalled();
});
it("detects expired plans, another owner, and changed configuration without replacing files", async () => {
	const f = await fixture();
	await f.select();
	const review = await f.service.prepare(1, "download");
	await expect(f.service.install(2, review.plan!.id)).rejects.toThrow("invalid-plan");
	const now = vi.spyOn(Date, "now").mockReturnValue(review.plan!.expiresAt + 1);
	await expect(f.service.install(1, review.plan!.id)).rejects.toThrow("invalid-plan");
	now.mockRestore();
	await fs.writeFile(f.config, '{"external":true}');
	expect((await f.service.install(1, review.plan!.id)).error).toBe("configuration-changed");
	expect(await fs.readFile(f.config, "utf8")).toBe('{"external":true}');
	expect(f.deps.download).not.toHaveBeenCalled();
});
it("failed verification removes only owned staging files and leaves preexisting models/configuration alone", async () => {
	const f = await fixture();
	await f.select();
	const review = await f.service.prepare(1, "download");
	f.deps.download.mockImplementation(async (_url, file) => {
		await fs.writeFile(file, "bad");
	});
	expect((await f.service.install(1, review.plan!.id)).error).toBe("model-integrity");
	expect(
		(await fs.readdir(f.root)).filter(
			(n) => n.startsWith(".ppstudio-voice-") || n.startsWith("PurplePrint-Voice-"),
		),
	).toEqual([]);
	expect(await fs.readFile(path.join(f.model, "model.safetensors"), "utf8")).toBe(f.payload);
	await expect(fs.stat(f.config)).rejects.toThrow();
});
it("cancellation remains responsive while downloading and cleanup finishes before returning", async () => {
	const f = await fixture();
	await f.select();
	const review = await f.service.prepare(1, "download");
	const service = f.service;
	f.deps.download.mockImplementation(async (_url, file) => {
		await fs.writeFile(file, "partial");
		service.cancel(1);
	});
	expect((await service.install(1, review.plan!.id)).phase).toBe("cancelled");
	expect((await fs.readdir(f.root)).some((n) => n.startsWith(".ppstudio-voice-"))).toBe(false);
	await expect(fs.stat(f.config)).rejects.toThrow();
});
it("does not replace an existing destination; close invalidates an approved plan", async () => {
	const f = await fixture();
	await f.select();
	let review = await f.service.prepare(1, "download");
	await fs.mkdir(review.plan!.modelPath);
	expect((await f.service.install(1, review.plan!.id)).error).toBe("destination-exists");
	expect((await fs.stat(review.plan!.modelPath)).isDirectory()).toBe(true);
	review = await f.service.prepare(1, "download");
	f.service.close(1);
	await expect(f.service.install(1, review.plan!.id)).rejects.toThrow("invalid-plan");
});
