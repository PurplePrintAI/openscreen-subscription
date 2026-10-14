import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	type AxcutDocument,
	createEmptyDocument,
	documentSchema,
} from "../../src/lib/ai-edition/schema";
import {
	GSAP_VERSION,
	HYPERFRAMES_VERSION,
	hyperframesRequestSchema,
	type MotionScene,
} from "../../src/lib/hyperframes";
import { buildMotionComposition } from "./composition";
import { loadRuntime, runLocal, runtimeEnvironment } from "./runtime";
import { HyperframesService, validateMotionOutput } from "./service";

const scene: MotionScene = {
	title: "연결 확인",
	subtitle: "진단 장면입니다.",
	eyebrow: "RUNTIME TEST",
	durationSec: 18,
};
const probe = JSON.stringify({
	streams: [{ codec_type: "video", width: 1920, height: 1080, r_frame_rate: "30/1" }],
	format: { duration: "18" },
});
const roots: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const root of roots.splice(0)) {
		if (
			path.dirname(root) !== os.tmpdir() ||
			!path.basename(root).startsWith("studio-motion-test-")
		)
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-motion-test-"));
	roots.push(root);
	const runtimeDir = path.join(root, "runtime");
	await fs.mkdir(path.join(runtimeDir, "node_modules", "hyperframes", "bin"), { recursive: true });
	await fs.mkdir(path.join(runtimeDir, "node_modules", "gsap", "dist"), { recursive: true });
	for (const [name, version] of [
		["hyperframes", HYPERFRAMES_VERSION],
		["gsap", GSAP_VERSION],
	])
		await fs.writeFile(
			path.join(runtimeDir, "node_modules", name, "package.json"),
			JSON.stringify({ version }),
		);
	await fs.writeFile(path.join(runtimeDir, "node_modules/hyperframes/bin/hyperframes.mjs"), "");
	await fs.writeFile(
		path.join(runtimeDir, "node_modules/gsap/dist/gsap.min.js"),
		"/* local test */",
	);
	const config = {
		nodePath: path.join(root, "node"),
		browserPath: path.join(root, "browser"),
		ffmpegPath: path.join(root, "ffmpeg"),
		ffprobePath: path.join(root, "ffprobe"),
	};
	for (const file of Object.values(config)) await fs.writeFile(file, "");
	await fs.writeFile(path.join(runtimeDir, "local-runtime.json"), JSON.stringify(config));
	const document = createEmptyDocument({ projectId: "proj_source", title: "Original" });
	const recording = path.join(root, "original.mp4");
	await fs.writeFile(recording, "original bytes");
	document.assets.push({
		id: "source",
		kind: "video",
		originalPath: recording,
		label: "Original",
		durationSec: 40,
		cameraTrack: null,
	});
	const run = vi.fn<typeof runLocal>(async (exe, args, cwd) => {
		if (args[0] === "--version") return "v22.22.1";
		if (args[1] === "lint") return '{"ok":true}';
		if (args[1] === "render") {
			await fs.writeFile(path.join(cwd, "rendered.mp4"), Buffer.alloc(2048));
			return "ok";
		}
		if (exe === config.ffprobePath)
			return args.at(-1) === recording
				? JSON.stringify({ streams: [{ codec_type: "video" }], format: { duration: "40" } })
				: probe;
		return "";
	});
	const saveDocument = vi.fn(async (doc: AxcutDocument) => doc);
	const service = new HyperframesService({
		root: path.join(root, "jobs"),
		runtimeDir,
		getDocument: async () => document,
		saveDocument,
		run,
	});
	return { root, runtimeDir, config, recording, document, run, saveDocument, service };
}

describe("local composition boundary", () => {
	it("resolves saved runtime changes for the next status and render", async () => {
		const f = await fixture();
		let selected = path.join(f.root, "not-configured");
		const service = new HyperframesService({
			root: path.join(f.root, "configured-jobs"),
			runtimeDir: selected,
			resolveRuntimeDir: async () => selected,
			getDocument: async () => f.document,
			saveDocument: f.saveDocument,
			run: f.run,
		});
		expect((await service.status()).runtime.available).toBe(false);
		selected = f.runtimeDir;
		expect((await service.status()).runtime).toMatchObject({
			available: true,
			runtimeDir: selected,
		});
		expect((await service.render(scene)).phase).toBe("ready");
		expect(f.saveDocument).toHaveBeenCalledOnce();
	});
	it("escapes text and rejects arbitrary script, source paths and excessive duration", () => {
		const html = buildMotionComposition({ ...scene, title: '<script>alert("x")</script>' });
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>alert");
		expect(html).toContain("./assets/gsap.min.js");
		expect(html).not.toContain("https://");
		expect(html).not.toContain('id="eyebrow"');
		expect(html).not.toContain("RUNTIME TEST");
		for (const input of [
			{ ...scene, durationSec: 21 },
			{ ...scene, html: "<script>" },
			{ ...scene, source: { path: "C:/secret", startSec: 0 } },
		])
			expect(hyperframesRequestSchema.safeParse({ action: "render", scene: input }).success).toBe(
				false,
			);
	});
	it("requires exact runtime versions and does not pass ambient AI credentials", async () => {
		const f = await fixture();
		const runtime = await loadRuntime(f.runtimeDir);
		vi.stubEnv("OPENAI_API_KEY", "must-not-escape");
		vi.stubEnv("ANTHROPIC_API_KEY", "must-not-escape");
		vi.stubEnv("ELECTRON_RUN_AS_NODE", "1");
		const env = runtimeEnvironment(runtime, f.root);
		expect(env.OPENAI_API_KEY).toBeUndefined();
		expect(env.ANTHROPIC_API_KEY).toBeUndefined();
		expect(env.ELECTRON_RUN_AS_NODE).toBeUndefined();
		expect(env.HYPERFRAMES_BROWSER_PATH).toBe(f.config.browserPath);
		await fs.writeFile(
			path.join(f.runtimeDir, "node_modules/hyperframes/package.json"),
			'{"version":"999"}',
		);
		expect((await f.service.status()).runtime.available).toBe(false);
		expect((await f.service.render(scene)).phase).toBe("error");
		expect(f.saveDocument).not.toHaveBeenCalled();
	});
	it("checks output geometry and duration before importing", () => {
		expect(() => validateMotionOutput(probe, 18)).not.toThrow();
		expect(() => validateMotionOutput(probe, 20)).toThrow();
		expect(() => validateMotionOutput(probe.replace("1920", "1280"), 18)).toThrow();
	});
});

describe("local render lifecycle", () => {
	it("persists a new editable project only after lint, render and decode", async () => {
		const f = await fixture();
		const result = await f.service.render(scene);
		expect(result.phase).toBe("ready");
		expect(f.saveDocument).toHaveBeenCalledOnce();
		const doc = documentSchema.parse(f.saveDocument.mock.calls[0][0]);
		expect(doc.project.id).not.toBe(f.document.project.id);
		expect(doc.timeline.clips[0].timelineEndSec).toBe(18);
		expect(doc.assets[0].transcriptionFailure?.kind).toBe("no-audio");
		expect(f.run.mock.calls.some(([, args]) => args.includes("null"))).toBe(true);
		expect(
			JSON.parse(await fs.readFile(path.join(result.folder!, "scene.json"), "utf8")).scene,
		).toEqual(scene);
	});
	it("uses registered local footage, preserves original and retains source offset provenance", async () => {
		const f = await fixture();
		const input = {
			...scene,
			source: { projectId: "proj_source", assetId: "source", startSec: 7 },
		};
		const result = await f.service.render(input);
		expect(result.phase).toBe("ready");
		expect(await fs.readFile(f.recording, "utf8")).toBe("original bytes");
		expect(input.source.startSec).toBe(7);
		expect(
			JSON.parse(await fs.readFile(path.join(result.folder!, "scene.json"), "utf8")).scene.source
				.startSec,
		).toBe(7);
		const html = await fs.readFile(path.join(result.folder!, "index.html"), "utf8");
		expect(html).toContain('data-media-start="0"');
		// HyperFrames must not apply both a wrapper offset and video timing.
		expect(html.match(/<section[^>]*>/)?.[0]).not.toContain("data-start");
		const transcode = f.run.mock.calls.find(([, args]) => args.includes("libx264"));
		expect(transcode?.[1]).toEqual(
			expect.arrayContaining(["-protocol_whitelist", "file,pipe", "-ss", "7", "-an"]),
		);
	});
	it("rejects playlist inputs rather than following network media references", async () => {
		const f = await fixture();
		f.document.assets[0].originalPath = path.join(f.root, "stream.m3u8");
		const result = await f.service.render({
			...scene,
			source: { projectId: "proj_source", assetId: "source", startSec: 0 },
		});
		expect(result.phase).toBe("error");
		expect(f.saveDocument).not.toHaveBeenCalled();
	});
	it("serializes requests and cancels before project import", async () => {
		const f = await fixture();
		f.run.mockImplementation(
			async (_exe, _args, _cwd, _env, signal) =>
				new Promise((_resolve, reject) => {
					if (signal.aborted) reject(new Error("cancelled"));
					else
						signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
				}),
		);
		const first = f.service.render(scene);
		await expect(f.service.render(scene)).rejects.toThrow("already running");
		f.service.cancel();
		expect((await first).phase).toBe("cancelled");
		expect(f.saveDocument).not.toHaveBeenCalled();
	});
	it("does not import failed output", async () => {
		const f = await fixture();
		f.run.mockImplementation(async () => {
			throw new Error("encoder unavailable");
		});
		const result = await f.service.render(scene);
		expect(result.error).toContain("encoder unavailable");
		expect(f.saveDocument).not.toHaveBeenCalled();
	});
	it("reports a completed import even when cancelled at the commit point", async () => {
		const f = await fixture();
		f.saveDocument.mockImplementation(async (doc) => {
			f.service.cancel();
			return doc;
		});
		expect((await f.service.render(scene)).phase).toBe("ready");
	});
	it("stops only its own child on timeout", async () => {
		const f = await fixture();
		await expect(
			runLocal(
				process.execPath,
				["-e", "setInterval(()=>{},1000)"],
				f.root,
				{ ...process.env },
				new AbortController().signal,
				100,
			),
		).rejects.toThrow("timed out");
	});
});
