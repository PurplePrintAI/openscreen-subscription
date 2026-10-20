import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVideoFrameReader } from "./videoFrameReader";

const folders: string[] = [];
afterEach(async () => {
	for (const dir of folders.splice(0)) {
		if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith("studio-frame-test-"))
			throw new Error("Unsafe test cleanup path");
		await rm(dir, { recursive: true, force: true });
	}
});
async function fixture(allowed = true) {
	const dir = await mkdtemp(path.join(os.tmpdir(), "studio-frame-test-"));
	folders.push(dir);
	const file = path.join(dir, "video.mp4");
	await writeFile(file, "fixture");
	const canonical = await realpath(file);
	const confirm = vi.fn(async () => allowed);
	const extract = vi.fn(async () => Buffer.from("bounded-jpeg"));
	const reader = createVideoFrameReader({
		resolveApprovedPath: (p) => (p === file || p === canonical ? p : null),
		confirm,
		ffmpeg: () => "bundled-ffmpeg",
		extract,
	});
	return {
		reader,
		confirm,
		extract,
		input: { assetId: "asset", label: "Demo", originalPath: file, sourceTimeSec: 1 },
	};
}
describe("frame disclosure consent and file authorization", () => {
	it("does not expose local paths when the approved media disappears", async () => {
		const f = await fixture();
		await rm(f.input.originalPath);
		await expect(f.reader.read(f.input)).rejects.toThrow(
			"The approved video is no longer accessible.",
		);
		expect(f.confirm).not.toHaveBeenCalled();
		expect(f.extract).not.toHaveBeenCalled();
	});
	it("checks the resolved path again before asking for disclosure", async () => {
		const f = await fixture();
		const alias = `${path.dirname(f.input.originalPath)}${path.sep}.${path.sep}video.mp4`;
		const reader = createVideoFrameReader({
			resolveApprovedPath: (p) => (p === alias ? p : null),
			confirm: f.confirm,
			extract: f.extract,
			ffmpeg: () => "unused",
		});
		await expect(reader.read({ ...f.input, originalPath: alias })).rejects.toThrow("outside");
		expect(f.confirm).not.toHaveBeenCalled();
		expect(f.extract).not.toHaveBeenCalled();
	});
	it("never decodes an unapproved path or a declined asset, and does not reprompt after decline", async () => {
		const f = await fixture(false);
		await expect(
			f.reader.read({ ...f.input, originalPath: "/arbitrary/file.mp4" }),
		).rejects.toThrow("approved");
		expect(f.confirm).not.toHaveBeenCalled();
		await expect(f.reader.read(f.input)).rejects.toThrow("declined");
		await expect(f.reader.read(f.input)).rejects.toThrow("declined");
		expect(f.confirm).toHaveBeenCalledOnce();
		expect(f.extract).not.toHaveBeenCalled();
	});
	it("confirms once per asset within the turn and returns actual image bytes", async () => {
		const f = await fixture();
		expect(await f.reader.read(f.input)).toEqual({
			mimeType: "image/jpeg",
			data: Buffer.from("bounded-jpeg").toString("base64"),
		});
		await f.reader.read({ ...f.input, sourceTimeSec: 2 });
		expect(f.confirm).toHaveBeenCalledOnce();
		await f.reader.read({ ...f.input, assetId: "different-asset" });
		expect(f.confirm).toHaveBeenCalledTimes(2);
	});
});
