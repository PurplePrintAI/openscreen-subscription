import { spawn } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import type { VideoFrameReader } from "../ai-edition/video-frames";
import { resolveFfmpeg } from "./audioPeaks";

const MAX_FRAME_BYTES = 2 * 1024 * 1024;

/** Decode one bounded JPEG locally. No shell, remote protocols or temporary image files. */
export function extractVideoFrame(
	executable: string,
	filePath: string,
	sourceTimeSec: number,
): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const child = spawn(
			executable,
			[
				"-hide_banner",
				"-loglevel",
				"error",
				"-nostdin",
				"-protocol_whitelist",
				"file,pipe",
				"-ss",
				sourceTimeSec.toFixed(4),
				"-i",
				filePath,
				"-map",
				"0:v:0",
				"-frames:v",
				"1",
				"-an",
				"-sn",
				"-dn",
				"-vf",
				"scale=1280:1280:force_original_aspect_ratio=decrease",
				"-c:v",
				"mjpeg",
				"-q:v",
				"3",
				"-f",
				"image2pipe",
				"pipe:1",
			],
			{ windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"] },
		);
		const chunks: Buffer[] = [];
		let bytes = 0;
		let failure: Error | undefined;
		const timer = setTimeout(() => {
			failure = new Error("Video frame extraction timed out.");
			child.kill();
		}, 20_000);
		child.stdout.on("data", (chunk: Buffer) => {
			bytes += chunk.length;
			if (bytes > MAX_FRAME_BYTES) {
				failure = new Error("The extracted frame exceeds the image size limit.");
				child.kill();
			} else chunks.push(chunk);
		});
		// Drain diagnostics without returning local paths or media metadata to the model.
		child.stderr.resume();
		child.once("error", () => {
			failure = new Error("The video frame decoder could not be started.");
		});
		child.once("close", (code) => {
			clearTimeout(timer);
			if (failure) return reject(failure);
			if (code !== 0) return reject(new Error("The video frame could not be decoded."));
			const image = Buffer.concat(chunks);
			if (image.length < 20 || image[0] !== 0xff || image[1] !== 0xd8)
				return reject(new Error("No image was returned for that timestamp."));
			resolve(image);
		});
	});
}

/** Create per turn: a consent grant never carries into another chat request. */
export function createVideoFrameReader(options: {
	resolveApprovedPath: (filePath: string) => string | null;
	confirm: (label: string) => Promise<boolean>;
	ffmpeg?: () => string | null;
	extract?: typeof extractVideoFrame;
}): VideoFrameReader {
	const grants = new Map<string, Promise<boolean>>();
	return {
		async read({ assetId, label, originalPath, sourceTimeSec }) {
			const approved = options.resolveApprovedPath(originalPath);
			if (!approved) throw new Error("This video has not been approved for reading.");
			const canonical = await realpath(approved).catch(() => {
				throw new Error("The approved video is no longer accessible.");
			});
			const isFile = await stat(canonical).then(
				(value) => value.isFile(),
				() => false,
			);
			if (!options.resolveApprovedPath(canonical) || !isFile)
				throw new Error("The video resolves outside the approved media paths.");
			const key = `${assetId}\0${canonical}`;
			let grant = grants.get(key);
			if (!grant) {
				grant = options.confirm(label);
				grants.set(key, grant);
			}
			if (!(await grant))
				throw new Error("The user declined sending video frames to the AI provider.");
			const executable = (options.ffmpeg ?? resolveFfmpeg)();
			if (!executable) throw new Error("The bundled video frame decoder is unavailable.");
			const image = await (options.extract ?? extractVideoFrame)(
				executable,
				canonical,
				sourceTimeSec,
			);
			return { mimeType: "image/jpeg", data: image.toString("base64") };
		},
	};
}
