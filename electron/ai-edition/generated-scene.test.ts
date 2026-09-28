import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeStillScene, saveGeneratedImage } from "./generated-scene";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("studio-scene-test-"))
			throw new Error("Unsafe test cleanup path");
		await fs.rm(root, { recursive: true, force: true });
	}
});

async function temporaryRoot(): Promise<string> {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-scene-test-"));
	roots.push(root);
	return root;
}

function pngBytes(): Buffer {
	const bytes = Buffer.alloc(256);
	Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(bytes);
	return bytes;
}

describe("generated still scene assets", () => {
	it("copies a Codex image to app-owned project storage and retains the source", async () => {
		const root = await temporaryRoot();
		const source = path.join(root, "codex-output.png");
		await fs.writeFile(source, pngBytes());
		const saved = await saveGeneratedImage(root, "proj_123", { savedPath: source });
		expect(saved.imagePath).toContain(path.join("generated-scenes", "proj_123"));
		expect(saved.videoPath).toBe(saved.imagePath.replace(/\.png$/, ".mp4"));
		expect(await fs.readFile(saved.imagePath)).toEqual(pngBytes());
		expect(await fs.readFile(source)).toEqual(pngBytes());
	});

	it("accepts an inline image but rejects traversal and non-image data", async () => {
		const root = await temporaryRoot();
		const inline = `data:image/png;base64,${pngBytes().toString("base64")}`;
		expect(await saveGeneratedImage(root, "proj_123", { result: inline })).toMatchObject({
			imagePath: expect.stringMatching(/\.png$/),
		});
		await expect(saveGeneratedImage(root, "../other", { result: inline })).rejects.toThrow(
			"Invalid project id",
		);
		await expect(
			saveGeneratedImage(root, "proj_123", { result: Buffer.alloc(256).toString("base64") }),
		).rejects.toThrow("unsupported or invalid");
	});

	it("encodes a five-second clip and falls back when OpenH264 is missing", async () => {
		const root = await temporaryRoot();
		const imagePath = path.join(root, "source.png");
		const videoPath = path.join(root, "scene.mp4");
		await fs.writeFile(imagePath, pngBytes());
		const run = vi.fn(async (_exe: string, args: string[]) => {
			if (args.includes("libopenh264")) throw new Error("Unknown encoder 'libopenh264'");
			await fs.writeFile(args.at(-1)!, Buffer.alloc(2_000));
		});
		await encodeStillScene(imagePath, videoPath, "ffmpeg", run);
		expect(run).toHaveBeenCalledTimes(2);
		expect(run.mock.calls[0][1]).toContain("libopenh264");
		expect(run.mock.calls[1][1]).toContain("mpeg4");
		expect(run.mock.calls[1][1]).toContain("120");
		expect((await fs.stat(videoPath)).size).toBe(2_000);
		expect(await fs.readFile(imagePath)).toEqual(pngBytes());
	});
});
