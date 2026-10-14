import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import type { DemoFraming, FocusBounds, FocusSample } from "../../src/lib/demo-framing";
import type { DemoBrowser } from "./browser";
import type { DemoTake } from "./document";

export interface FrameTime {
	file: string;
	at: number;
}

export function frameManifest(frames: FrameTime[], durationSec: number): string {
	if (!frames.length) throw new Error("No frames were recorded.");
	const lines = ["ffconcat version 1.0"];
	for (const [index, frame] of frames.entries()) {
		if (!/^frame-\d{6}\.jpg$/.test(frame.file)) throw new Error("Invalid frame name.");
		const end = frames[index + 1]?.at ?? durationSec;
		const start = index === 0 ? 0 : frame.at;
		if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end > durationSec)
			throw new Error("Invalid frame timing.");
		lines.push(`file '${frame.file}'`, `duration ${(end - start).toFixed(6)}`);
	}
	lines.push(`file '${frames[frames.length - 1].file}'`);
	return `${lines.join("\n")}\n`;
}

export async function encodeTake(
	ffmpeg: string,
	folder: string,
	seconds: number,
	signal: AbortSignal,
): Promise<void> {
	const args = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-nostdin",
		"-n",
		"-f",
		"concat",
		"-safe",
		"1",
		"-i",
		path.join(folder, "frames.ffconcat"),
		"-vf",
		"tpad=stop_mode=clone:stop_duration=0.1",
		"-frames:v",
		String(seconds * 30),
		"-r",
		"30",
		"-an",
		"-c:v",
		"libopenh264",
		"-b:v",
		"6M",
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"+faststart",
		path.join(folder, "take.mp4"),
	];
	await new Promise<void>((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("Production cancelled."));
			return;
		}
		const child = spawn(ffmpeg, args, {
			shell: false,
			windowsHide: true,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let diagnostic = "";
		const abort = () => child.kill();
		signal.addEventListener("abort", abort, { once: true });
		const timeout = setTimeout(() => child.kill(), 120_000);
		child.stderr.on("data", (chunk: Buffer) => {
			diagnostic = (diagnostic + chunk.toString()).slice(-3000);
		});
		child.on("error", reject);
		child.on("close", (code) => {
			clearTimeout(timeout);
			signal.removeEventListener("abort", abort);
			if (signal.aborted) reject(new Error("Production cancelled."));
			else if (code !== 0) reject(new Error(`Video encoding failed (${code}): ${diagnostic}`));
			else resolve();
		});
	});
	if ((await fs.stat(path.join(folder, "take.mp4"))).size < 1000)
		throw new Error("Empty encoded take.");
}

/** Real browser frames, sampled at up to 12 fps and time-stamped. Encoding at
 * 30 fps repeats frames; slow captures never silently speed up the recording. */
export async function captureTake(
	browser: DemoBrowser,
	folder: string,
	seconds: number,
	ffmpeg: string,
	signal: AbortSignal,
	onEncoding: () => void,
	focus?: { framing: DemoFraming; observe: () => Promise<FocusBounds | null> },
): Promise<DemoTake> {
	await fs.mkdir(folder, { recursive: true });
	const frames: FrameTime[] = [];
	const focusSamples: FocusSample[] = [];
	const started = performance.now();
	while (performance.now() - started < seconds * 1000) {
		signal.throwIfAborted();
		const at = (performance.now() - started) / 1000;
		const frame = await browser.frame();
		signal.throwIfAborted();
		const file = `frame-${String(frames.length).padStart(6, "0")}.jpg`;
		await fs.writeFile(path.join(folder, file), frame, { flag: "wx" });
		frames.push({ file, at });
		// Sample only before zoom lead-in, while recording the real scrolling/tab change.
		if (
			focus &&
			focusSamples.length < 3 &&
			at >= focus.framing.startSec - 2 + focusSamples.length * 0.25
		) {
			const bounds = await focus.observe();
			focusSamples.push({ atSec: (performance.now() - started) / 1000, bounds });
		}
		await delay(Math.max(1, 1000 / 12 - (performance.now() - started - at * 1000)), undefined, {
			signal,
		});
	}
	await fs.writeFile(path.join(folder, "frames.ffconcat"), frameManifest(frames, seconds));
	onEncoding();
	await encodeTake(ffmpeg, folder, seconds, signal);
	// Remove only the frame files written by this take, after successful encoding.
	// The first frame and timestamps remain as evidence alongside the source MP4.
	await fs.writeFile(
		path.join(folder, "capture.json"),
		JSON.stringify({ durationSec: seconds, sampleFps: 12, frames, focusSamples }, null, 2),
	);
	for (const frame of frames.slice(1)) await fs.unlink(path.join(folder, frame.file));
	return {
		path: path.join(folder, "take.mp4"),
		durationSec: seconds,
		width: 1280,
		height: 720,
		focusSamples,
	};
}
