import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveFfmpeg } from "../media/audioPeaks";

const MAX_IMAGE_BYTES = 40 * 1024 * 1024;
const VIDEO_FRAMES = 120; // Five seconds at 24 fps.

export interface CodexGeneratedImage {
	savedPath?: string;
	result?: string;
}

function imageExtension(bytes: Buffer): ".png" | ".jpg" | ".webp" | null {
	if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return ".png";
	if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return ".jpg";
	if (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
		return ".webp";
	return null;
}

async function imageBytes(image: CodexGeneratedImage): Promise<Buffer> {
	if (image.savedPath && path.isAbsolute(image.savedPath)) {
		try {
			const stat = await fs.stat(image.savedPath);
			if (stat.isFile() && stat.size > 0 && stat.size <= MAX_IMAGE_BYTES)
				return await fs.readFile(image.savedPath);
		} catch {
			// Some Codex versions return only an inline image. Try that below.
		}
	}
	const inline = image.result;
	if (!inline) throw new Error("Codex returned no readable image file.");
	const base64 = inline.replace(/^data:image\/(?:png|jpeg|webp);base64,/i, "").replace(/\s/g, "");
	if (
		base64.length > Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8 ||
		!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
	)
		throw new Error("Codex returned invalid image data.");
	return Buffer.from(base64, "base64");
}

/** Copy the image into Studio-owned project storage before the CLI removes its temporary file. */
export async function saveGeneratedImage(
	userData: string,
	projectId: string,
	image: CodexGeneratedImage,
): Promise<{ imagePath: string; videoPath: string }> {
	if (!/^[A-Za-z0-9_-]+$/.test(projectId)) throw new Error("Invalid project id.");
	const bytes = await imageBytes(image);
	const extension = imageExtension(bytes);
	if (!extension || bytes.length < 100 || bytes.length > MAX_IMAGE_BYTES)
		throw new Error("Codex returned an unsupported or invalid image.");
	const folder = path.join(userData, "generated-scenes", projectId);
	await fs.mkdir(folder, { recursive: true });
	const id = randomUUID();
	const imagePath = path.join(folder, `${id}${extension}`);
	const videoPath = path.join(folder, `${id}.mp4`);
	await fs.writeFile(imagePath, bytes, { flag: "wx" });
	return { imagePath, videoPath };
}

function runFfmpeg(executable: string, args: string[]): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(executable, args, {
			windowsHide: true,
			shell: false,
			stdio: ["ignore", "ignore", "pipe"],
		});
		let stderr = "";
		let settled = false;
		const timer = setTimeout(() => {
			if (settled) return;
			settled = true;
			child.kill();
			reject(new Error("Video encoding timed out."));
		}, 120_000);
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-2_000);
		});
		child.once("error", (error) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			reject(error);
		});
		child.once("close", (code) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			if (code === 0) resolve();
			else reject(new Error(`Video encoding failed${stderr ? `: ${stderr}` : "."}`));
		});
	});
}

/** A reusable timeline clip; the untouched source image remains beside it. */
export async function encodeStillScene(
	imagePath: string,
	videoPath: string,
	ffmpeg = resolveFfmpeg(),
	run: (executable: string, args: string[]) => Promise<void> = runFfmpeg,
): Promise<void> {
	if (!ffmpeg) throw new Error("The bundled FFmpeg encoder is unavailable.");
	const temporary = videoPath.replace(/\.mp4$/i, ".encoding.mp4");
	const base = [
		"-hide_banner",
		"-loglevel",
		"error",
		"-y",
		"-loop",
		"1",
		"-framerate",
		"24",
		"-i",
		imagePath,
		"-frames:v",
		String(VIDEO_FRAMES),
		"-vf",
		"pad=ceil(iw/2)*2:ceil(ih/2)*2",
		"-pix_fmt",
		"yuv420p",
		"-movflags",
		"+faststart",
		"-an",
	];
	try {
		try {
			await run(ffmpeg, [...base, "-c:v", "libopenh264", "-b:v", "8M", temporary]);
		} catch (error) {
			if (!/Unknown encoder|Encoder .* not found/i.test(String(error))) throw error;
			// LGPL builds on some platforms omit OpenH264. The original image stays lossless.
			await fs.rm(temporary, { force: true });
			await run(ffmpeg, [...base, "-c:v", "mpeg4", "-q:v", "2", temporary]);
		}
		const stat = await fs.stat(temporary);
		if (!stat.isFile() || stat.size < 1_000) throw new Error("Encoder returned an empty clip.");
		await fs.rename(temporary, videoPath);
	} finally {
		await fs.rm(temporary, { force: true });
	}
}
