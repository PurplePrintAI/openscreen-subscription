import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
	type AxcutDocument,
	createEmptyDocument,
	documentSchema,
} from "../../src/lib/ai-edition/schema";
import {
	GSAP_VERSION,
	HYPERFRAMES_VERSION,
	type HyperframesStatus,
	type MotionScene,
	motionSceneSchema,
} from "../../src/lib/hyperframes";
import { buildMotionComposition } from "./composition";
import {
	loadRuntime,
	type RuntimePaths,
	runLocal,
	runtimeEnvironment,
	runtimeStatus,
} from "./runtime";

interface Dependencies {
	root: string;
	runtimeDir: string;
	getDocument: (id: string) => Promise<AxcutDocument>;
	saveDocument: (doc: AxcutDocument) => Promise<AxcutDocument>;
	run?: typeof runLocal;
}

interface VideoProbe {
	streams?: Array<{ codec_type?: string; width?: number; height?: number; r_frame_rate?: string }>;
	format?: { duration?: string };
}
export function validateMotionOutput(text: string, seconds: number): void {
	const probe = JSON.parse(text) as VideoProbe;
	const video = probe.streams?.find((stream) => stream.codec_type === "video");
	if (
		!video ||
		video.width !== 1920 ||
		video.height !== 1080 ||
		video.r_frame_rate !== "30/1" ||
		!Number.isFinite(Number(probe.format?.duration)) ||
		Math.abs(Number(probe.format?.duration) - seconds) > 0.06
	) {
		throw new Error("Rendered video did not match the requested 1080p / 30 fps duration.");
	}
}

export function motionDocument(
	projectId: string,
	scene: MotionScene,
	outputPath: string,
): AxcutDocument {
	const doc = createEmptyDocument({ projectId, title: scene.title });
	doc.project.primaryAssetId = "asset_motion";
	doc.assets.push({
		id: "asset_motion",
		kind: "video",
		label: scene.title,
		originalPath: outputPath,
		durationSec: scene.durationSec,
		video: { codec: "h264", width: 1920, height: 1080, fps: 30 },
		cameraTrack: null,
		transcriptionFailure: { kind: "no-audio", message: "Silent HyperFrames composition." },
	});
	doc.timeline.clips.push({
		id: "clip_motion",
		assetId: "asset_motion",
		sourceStartSec: 0,
		sourceEndSec: scene.durationSec,
		timelineStartSec: 0,
		timelineEndSec: scene.durationSec,
		wordRefs: [],
		origin: "agent",
		reason:
			"HyperFrames render. Editable HTML and scene.json are beside the source video; change inputs and re-render to revise graphics.",
	});
	doc.legacyEditor = {
		aspectRatio: "16:9",
		padding: 0,
		borderRadius: 0,
		shadowIntensity: 0,
		motionBlurAmount: 0,
		wallpaper: "#111116",
		showBlur: false,
	};
	return documentSchema.parse(doc);
}

export class HyperframesService {
	private state: HyperframesStatus;
	private controller: AbortController | null = null;
	private active = false;
	private cancelled = false;
	constructor(private deps: Dependencies) {
		this.state = {
			phase: "idle",
			runtime: { available: false, version: HYPERFRAMES_VERSION, runtimeDir: deps.runtimeDir },
		};
	}
	async status(): Promise<HyperframesStatus> {
		if (!this.active) this.state.runtime = await runtimeStatus(this.deps.runtimeDir);
		return structuredClone(this.state);
	}
	cancel(): void {
		if (!this.active) return;
		this.cancelled = true;
		this.controller?.abort();
	}
	folderFor(jobId: string): string {
		if (this.state.jobId !== jobId || !this.state.folder) throw new Error("Unknown render job.");
		return this.state.folder;
	}
	private async persist(): Promise<void> {
		if (!this.state.folder) return;
		await fs.writeFile(
			path.join(this.state.folder, "render-status.json"),
			JSON.stringify(this.state, null, 2),
		);
	}
	async render(input: MotionScene): Promise<HyperframesStatus> {
		if (this.active) throw new Error("A HyperFrames render is already running.");
		const scene = motionSceneSchema.parse(input);
		// Lock before async preflight so a second request cannot start a renderer.
		this.active = true;
		this.cancelled = false;
		const controller = new AbortController();
		this.controller = controller;
		const jobId = randomUUID();
		const folder = path.join(this.deps.root, jobId);
		this.state = { phase: "preparing", jobId, folder, runtime: this.state.runtime };
		const run = this.deps.run ?? runLocal;
		try {
			await fs.mkdir(path.join(folder, "assets"), { recursive: true });
			const runtime = await loadRuntime(this.deps.runtimeDir);
			const env = runtimeEnvironment(runtime, folder);
			controller.signal.throwIfAborted();
			const version = await run(
				runtime.nodePath,
				["--version"],
				folder,
				env,
				controller.signal,
				10000,
			);
			if (Number(/^v(\d+)/.exec(version)?.[1]) < 22 || !/^v\d+/.test(version))
				throw new Error("Node.js 22+ is required.");
			this.state.runtime = {
				available: true,
				version: HYPERFRAMES_VERSION,
				runtimeDir: this.deps.runtimeDir,
			};
			if (scene.source) await this.copySource(scene, folder, runtime, env, controller.signal, run);
			await fs.copyFile(runtime.gsapPath, path.join(folder, "assets", "gsap.min.js"));
			await fs.writeFile(
				path.join(folder, "scene.json"),
				JSON.stringify(
					{ version: 1, hyperframesVersion: HYPERFRAMES_VERSION, gsapVersion: GSAP_VERSION, scene },
					null,
					2,
				),
			);
			await fs.writeFile(
				path.join(folder, "index.html"),
				buildMotionComposition({
					...scene,
					source: scene.source ? { ...scene.source, startSec: 0 } : undefined,
				}),
			);
			await fs.writeFile(
				path.join(folder, "README.txt"),
				"Studio-authored local HyperFrames composition. The MP4 graphics are flattened. Keep index.html, scene.json and assets together. Use Studio inputs to create a new render; do not overwrite the source recording.\n",
			);
			this.state.phase = "linting";
			await this.persist();
			const lint = await run(
				runtime.nodePath,
				[runtime.cliPath, "lint", folder, "--json"],
				folder,
				env,
				controller.signal,
				30000,
			);
			await fs.writeFile(path.join(folder, "lint.json"), lint);
			controller.signal.throwIfAborted();
			this.state.phase = "rendering";
			await this.persist();
			const outputPath = path.join(folder, "rendered.mp4");
			const log = await run(
				runtime.nodePath,
				[
					runtime.cliPath,
					"render",
					folder,
					"--output",
					outputPath,
					"--fps",
					"30",
					"--workers",
					"1",
					"--quality",
					"high",
					"--video-frame-format",
					"png",
					"--frames-cache-dir",
					"off",
				],
				folder,
				env,
				controller.signal,
			);
			await fs.writeFile(path.join(folder, "render.log"), log);
			controller.signal.throwIfAborted();
			this.state.phase = "verifying";
			await this.persist();
			if ((await fs.stat(outputPath)).size < 1000) throw new Error("The render output is empty.");
			const probe = await run(
				runtime.ffprobePath,
				["-v", "error", "-show_streams", "-show_format", "-of", "json", outputPath],
				folder,
				env,
				controller.signal,
				30000,
			);
			validateMotionOutput(probe, scene.durationSec);
			await fs.writeFile(path.join(folder, "probe.json"), probe);
			await run(
				runtime.ffmpegPath,
				["-v", "error", "-i", outputPath, "-f", "null", "-"],
				folder,
				env,
				controller.signal,
				30000,
			);
			await run(
				runtime.ffmpegPath,
				[
					"-v",
					"error",
					"-ss",
					String(Math.min(3, scene.durationSec / 2)),
					"-i",
					outputPath,
					"-frames:v",
					"1",
					"-n",
					path.join(folder, "poster.png"),
				],
				folder,
				env,
				controller.signal,
				30000,
			);
			controller.signal.throwIfAborted();
			const doc = motionDocument(`proj_${randomUUID()}`, scene, outputPath);
			await fs.writeFile(path.join(folder, "draft.openscreen"), JSON.stringify(doc, null, 2));
			await this.deps.saveDocument(doc);
			// Saving is the commit point. A late cancellation must not claim that a
			// successfully imported project was discarded.
			this.state = { ...this.state, phase: "ready", projectId: doc.project.id, outputPath };
		} catch (error) {
			this.state = {
				...this.state,
				phase: this.cancelled ? "cancelled" : "error",
				error: error instanceof Error ? error.message : String(error),
			};
		}
		try {
			await this.persist();
		} catch (error) {
			this.state.error = `Could not save render status: ${String(error)}`;
		} finally {
			this.active = false;
			this.controller = null;
		}
		return structuredClone(this.state);
	}
	private async copySource(
		scene: MotionScene,
		folder: string,
		runtime: RuntimePaths,
		env: NodeJS.ProcessEnv,
		signal: AbortSignal,
		run: typeof runLocal,
	) {
		const source = scene.source!;
		const doc = await this.deps.getDocument(source.projectId);
		const asset = doc.assets.find((a) => a.id === source.assetId);
		if (!asset || !path.isAbsolute(asset.originalPath))
			throw new Error("The selected recording was not found in this project.");
		if (!/\.(mp4|mov|m4v|webm|mkv)$/i.test(asset.originalPath))
			throw new Error("Select a local MP4, MOV, WebM or MKV recording.");
		const stat = await fs.stat(asset.originalPath);
		if (!stat.isFile() || stat.size > 2 * 1024 * 1024 * 1024)
			throw new Error("Select a local video smaller than 2 GB.");
		const data = JSON.parse(
			await run(
				runtime.ffprobePath,
				[
					"-v",
					"error",
					"-protocol_whitelist",
					"file,pipe",
					"-show_streams",
					"-show_format",
					"-of",
					"json",
					asset.originalPath,
				],
				folder,
				env,
				signal,
				30000,
			),
		) as VideoProbe;
		if (
			!data.streams?.some((s) => s.codec_type === "video") ||
			!Number.isFinite(Number(data.format?.duration)) ||
			Number(data.format?.duration) + 0.03 < source.startSec + scene.durationSec
		)
			throw new Error("The recording is shorter than the selected start time + scene length.");
		// Freeze only the required range into a browser-compatible local MP4. No audio or network references.
		await run(
			runtime.ffmpegPath,
			[
				"-v",
				"error",
				"-n",
				"-protocol_whitelist",
				"file,pipe",
				"-ss",
				String(source.startSec),
				"-i",
				asset.originalPath,
				"-t",
				String(scene.durationSec),
				"-an",
				"-c:v",
				"libx264",
				"-pix_fmt",
				"yuv420p",
				"-movflags",
				"+faststart",
				path.join(folder, "assets", "source.mp4"),
			],
			folder,
			env,
			signal,
		);
	}
}
