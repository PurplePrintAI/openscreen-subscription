import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { getNarration, withNarration } from "../../src/lib/narration";
import type { runLocal } from "../hyperframes/runtime";
import { approveNarrationExport, consumeNarrationExport, mixNarrationExport } from "./export";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("studio-mix-test-"))
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-mix-test-"));
	roots.push(root);
	const outputPath = path.join(root, "export.mp4"),
		audioPath = path.join(root, "voice.wav");
	await fs.writeFile(outputPath, "original video");
	await fs.writeFile(audioPath, "voice");
	const doc = withNarration(createEmptyDocument({ projectId: "qa", title: "QA" }), {
		version: 1,
		jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
		projectId: "qa",
		mode: "preset",
		text: "QA",
		audioPath,
		durationSec: 4,
		offsetSec: 1.5,
		originalGain: 0.4,
	});
	const run = vi.fn<typeof runLocal>(async (_exe, args) => {
		if (args.includes("-filter_complex")) await fs.writeFile(args.at(-1)!, Buffer.alloc(2048, 1));
		return "";
	});
	const controller = new AbortController();
	return {
		root,
		doc,
		run,
		controller,
		request: { projectId: "qa", outputPath, expectedLayer: getNarration(doc)! },
		deps: { ffmpeg: () => "ffmpeg", getDocument: vi.fn(async () => doc), run },
	};
}
it("requires a one-use native dialog approval scoped to the calling window", () => {
	const output = path.join(os.tmpdir(), "qa-mix.mp4");
	approveNarrationExport(101, output);
	expect(() => consumeNarrationExport(102, output)).toThrow("Save dialog");
	expect(() => consumeNarrationExport(101, output + ".other")).toThrow("Save dialog");
	consumeNarrationExport(101, output);
	expect(() => consumeNarrationExport(101, output)).toThrow("Save dialog");
	approveNarrationExport(101, output);
	approveNarrationExport(101, output + ".gif");
	expect(() => consumeNarrationExport(101, output)).toThrow("Save dialog");
});
it("mixes only the saved layer, copies video and promotes only after verification", async () => {
	const f = await fixture();
	await mixNarrationExport(f.request, f.deps, f.controller.signal);
	expect(f.run).toHaveBeenCalledTimes(2);
	const args = f.run.mock.calls[0][1];
	expect(args.slice(args.indexOf("-c:v"), args.indexOf("-c:v") + 2)).toEqual(["-c:v", "copy"]);
	expect(args[args.indexOf("-filter_complex") + 1]).toContain("adelay=1500:all=1");
	expect(args[args.indexOf("-filter_complex") + 1]).toContain("volume=0.4");
	expect((await fs.stat(f.request.outputPath)).size).toBe(2048);
	expect((await fs.readdir(f.root)).some((n) => n.startsWith(".studio-narration"))).toBe(false);
});
it.each([
	"encode",
	"verify",
	"cancel",
])("preserves the original export after %s failure", async (stage) => {
	const f = await fixture();
	if (stage === "encode") f.run.mockRejectedValueOnce(new Error("encode failed"));
	if (stage === "verify")
		f.run
			.mockImplementationOnce(f.run.getMockImplementation()!)
			.mockRejectedValueOnce(new Error("verify failed"));
	if (stage === "cancel")
		f.deps.getDocument
			.mockImplementationOnce(async () => f.doc)
			.mockImplementationOnce(async () => {
				f.controller.abort();
				return f.doc;
			});
	await expect(mixNarrationExport(f.request, f.deps, f.controller.signal)).rejects.toThrow();
	if (stage === "verify") expect(f.run).toHaveBeenCalledTimes(2);
	expect(await fs.readFile(f.request.outputPath, "utf8")).toBe("original video");
	expect((await fs.readdir(f.root)).some((n) => n.startsWith(".studio-narration"))).toBe(false);
});
it("rejects a changed voice layer and never replaces a registered source", async () => {
	const f = await fixture();
	await expect(
		mixNarrationExport(
			{ ...f.request, expectedLayer: { ...f.request.expectedLayer, offsetSec: 2 } },
			f.deps,
			f.controller.signal,
		),
	).rejects.toThrow("Narration changed");
	f.doc.assets.push({
		id: "source",
		kind: "video",
		label: "source",
		originalPath: f.request.outputPath,
		cameraTrack: null,
	});
	await expect(mixNarrationExport(f.request, f.deps, f.controller.signal)).rejects.toThrow(
		"source recording",
	);
	expect(f.run).not.toHaveBeenCalled();
});
it("does not replace an export externally changed during mixing", async () => {
	const f = await fixture();
	f.deps.getDocument
		.mockImplementationOnce(async () => f.doc)
		.mockImplementationOnce(async () => {
			await fs.writeFile(f.request.outputPath, "external update");
			return f.doc;
		});
	await expect(mixNarrationExport(f.request, f.deps, f.controller.signal)).rejects.toThrow(
		"Export changed",
	);
	expect(await fs.readFile(f.request.outputPath, "utf8")).toBe("external update");
});
