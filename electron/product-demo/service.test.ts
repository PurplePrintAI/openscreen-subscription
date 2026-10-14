import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { documentSchema } from "../../src/lib/ai-edition/schema";
import { createFramingZoom, type FocusSample, stableFocus } from "../../src/lib/demo-framing";
import {
	type DemoPage,
	type DemoPlan,
	type DemoTarget,
	demoBriefSchema,
	productUrl,
	validateDemoPlan,
} from "../../src/lib/product-demo";
import { buildSceneDescription } from "../../src/native/sceneDescription";
import { frameManifest } from "./capture";
import { createDemoDocument } from "./document";
import { readDemoPlan } from "./plan";
import { ProductDemoService } from "./service";

const brief = demoBriefSchema.parse({
	url: "https://purpleprint-ai.com",
	product: "PurplePrint",
	intent: "Explain features and concrete value.",
	maxSeconds: 150,
});
const page: DemoPage = {
	url: brief.url,
	title: "Product",
	text: "Example",
	targets: [
		{ id: 0, kind: "top", text: "Product", index: 0 },
		{ id: 1, kind: "tab", text: "Features", index: 0 },
	],
};
const plan: DemoPlan = {
	title: "Product draft",
	summary: "An honest product walkthrough",
	scenes: [
		{ title: "Problem", caption: "Start with the problem", targetId: 0, durationSec: 8 },
		{ title: "Value", caption: "Review the visible capabilities", targetId: 1, durationSec: 10 },
	],
};
const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("studio-demo-test-"))
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "studio-demo-test-"));
	roots.push(root);
	const browser = {
		open: vi.fn(async () => page),
		apply: vi.fn(async (_target: DemoTarget) => undefined),
		frame: vi.fn(async () => Buffer.alloc(100)),
		observeFocus: vi.fn(async () => ({ x: 0.6, y: 0.2, width: 0.3, height: 0.4 })),
		close: vi.fn(),
	};
	const saveDocument = vi.fn(async (doc: ReturnType<typeof createDemoDocument>) => doc);
	const capture = vi.fn(async (_browser: unknown, folder: string, durationSec: number) => ({
		path: path.join(folder, "take.mp4"),
		durationSec,
		width: 1280,
		height: 720,
	}));
	const planner = vi.fn(async () => plan);
	const service = new ProductDemoService({
		root,
		createBrowser: () => browser,
		planner,
		ffmpeg: () => "ffmpeg",
		saveDocument,
		capture,
	});
	return { service, browser, capture, planner, saveDocument, root };
}

describe("product demo planning boundaries", () => {
	it.each([
		"file:///C:/private.txt",
		"javascript:alert(1)",
		"https://name:secret@example.com/",
		"http://example.com/",
	])("rejects unsafe URL %s", (url) => {
		expect(() => productUrl(url)).toThrow();
	});
	it("accepts explicit HTTPS and local development URLs", () => {
		expect(productUrl("https://purpleprint-ai.com")).toBe("https://purpleprint-ai.com/");
		expect(productUrl("http://localhost:4321")).toBe("http://localhost:4321/");
	});
	it("rejects hallucinated targets, arbitrary actions and excessive durations", () => {
		expect(() =>
			validateDemoPlan({ ...plan, scenes: [{ ...plan.scenes[0], targetId: 999 }] }, brief, page),
		).toThrow("not observed");
		expect(() =>
			validateDemoPlan(
				{ ...plan, scenes: [{ ...plan.scenes[0], script: "fetch('/delete')" }] },
				brief,
				page,
			),
		).toThrow();
		expect(() => validateDemoPlan(plan, { ...brief, maxSeconds: 15 }, page)).toThrow("duration");
		expect(readDemoPlan(`\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``, brief, page)).toEqual(plan);
	});
	it("preserves time when browser captures are slow", () => {
		const manifest = frameManifest(
			[
				{ file: "frame-000000.jpg", at: 0.02 },
				{ file: "frame-000001.jpg", at: 0.4 },
			],
			1,
		);
		expect(manifest).toContain("duration 0.400000");
		expect(manifest).toContain("duration 0.600000");
		expect(() => frameManifest([{ file: "../private.jpg", at: 0 }], 1)).toThrow();
	});
});

describe("editable scene framing", () => {
	const framing = { startSec: 3, endSec: 6, scale: 1.25 };
	const bounds = { x: 0.6, y: 0.2, width: 0.3, height: 0.4 };
	const samples: FocusSample[] = [1, 1.3, 1.6].map((atSec) => ({ atSec, bounds }));
	it("rejects guessed coordinates, out-of-scene timing and top-page focus", () => {
		const scene = { ...plan.scenes[1], framing };
		expect(validateDemoPlan({ ...plan, scenes: [scene] }, brief, page).scenes[0].framing).toEqual(
			framing,
		);
		for (const override of [{ startSec: 1 }, { endSec: 10 }, { scale: 2 }, { cx: 0.7 }]) {
			expect(() =>
				validateDemoPlan(
					{ ...plan, scenes: [{ ...scene, framing: { ...framing, ...override } }] },
					brief,
					page,
				),
			).toThrow();
		}
		expect(() =>
			validateDemoPlan({ ...plan, scenes: [{ ...scene, targetId: 0 }] }, brief, page),
		).toThrow();
	});
	it("requires timely stable observations and retains full view for large targets", () => {
		expect(stableFocus(samples, framing)).toEqual(bounds);
		for (const bad of [
			samples.slice(0, 2),
			[...samples.slice(0, 2), { atSec: 3, bounds }],
			[...samples.slice(0, 2), { atSec: 1.6, bounds: null }],
			[...samples.slice(0, 2), { atSec: 1.6, bounds: { ...bounds, x: 0.65 } }],
		]) {
			expect(stableFocus(bad, framing)).toBeNull();
		}
		expect(
			createFramingZoom({
				id: "z",
				clipId: "c",
				sourceStartSec: 0,
				timelineStartSec: 0,
				durationSec: 8,
				framing,
				bounds: { x: 0, y: 0, width: 1, height: 1 },
			}),
		).toBeNull();
	});
	it("persists clip anchors, manual focus and real scale into the native scene", () => {
		const focused = { ...plan, scenes: [plan.scenes[0], { ...plan.scenes[1], framing }] };
		const takes = [8, 10].map((durationSec, i) => ({
			path: `/fixture/take-${i}.mp4`,
			durationSec,
			width: 2560,
			height: 1440,
			focusSamples: samples,
		}));
		const doc = documentSchema.parse(
			JSON.parse(JSON.stringify(createDemoDocument("proj_framed", focused, takes))),
		);
		expect(doc.zoomRanges[0]).toMatchObject({
			clipId: "clip_demo_1",
			sourceStartSec: 3,
			sourceEndSec: 6,
			startMs: 11000,
			endMs: 14000,
			customScale: 1.25,
			focusMode: "manual",
			focus: { cx: 0.75, cy: 0.4 },
		});
		expect(buildSceneDescription(doc).zoomRegions[0]).toMatchObject({ scale: 1.25 });
		expect(
			createDemoDocument(
				"proj_unstable",
				focused,
				takes.map((t) => ({ ...t, focusSamples: [] })),
			).zoomRanges,
		).toEqual([]);
	});
	it("passes the approved focus request to capture and reports skipped focus", async () => {
		const f = await fixture();
		const review = await f.service.plan(brief);
		const focused = { ...plan, scenes: [{ ...plan.scenes[1], framing }] };
		const result = await f.service.record(review.jobId!, focused);
		expect(result.phase).toBe("ready");
		expect(result.warnings).toEqual([expect.stringContaining("full view retained")]);
		const call = f.capture.mock.calls[0] as unknown as unknown[];
		const focus = call[6] as { framing: typeof framing; observe: () => Promise<unknown> };
		expect(focus.framing).toEqual(framing);
		expect(await focus.observe()).toEqual(bounds);
	});
});

describe("product demo lifecycle", () => {
	it("keeps planning locked until the review status has been persisted", async () => {
		const f = await fixture();
		let finish!: () => void;
		const write = vi.spyOn(fs, "writeFile").mockImplementationOnce(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		try {
			const pending = f.service.plan(brief);
			await vi.waitFor(() => expect(write).toHaveBeenCalled());
			await expect(f.service.plan(brief)).rejects.toThrow("already running");
			finish();
			expect((await pending).phase).toBe("review");
		} finally {
			write.mockRestore();
		}
	});
	it("reports the saved draft when cancellation arrives during the commit", async () => {
		const f = await fixture();
		const review = await f.service.plan(brief);
		f.saveDocument.mockImplementationOnce(async (doc) => {
			f.service.cancel();
			return doc;
		});
		const result = await f.service.record(review.jobId!, plan);
		expect(result.phase).toBe("ready");
		expect(result.projectId).toBe(f.saveDocument.mock.calls[0][0].project.id);
		expect(f.browser.close).toHaveBeenCalled();
	});
	it("requires review, captures only approved targets, saves a new editable project and closes the browser", async () => {
		const f = await fixture();
		await expect(f.service.record("missing", plan)).rejects.toThrow("Review");
		const review = await f.service.plan(brief);
		expect(review.phase).toBe("review");
		expect(f.capture).not.toHaveBeenCalled();
		await expect(f.service.record("stale-job", plan)).rejects.toThrow("Review");
		const result = await f.service.record(review.jobId!, plan);
		expect(result.phase).toBe("ready");
		expect(f.browser.apply.mock.calls.map(([target]) => target)).toEqual(page.targets);
		expect(f.browser.close).toHaveBeenCalled();
		const doc = documentSchema.parse(
			JSON.parse(await fs.readFile(path.join(result.folder!, "draft.openscreen"), "utf8")),
		);
		expect(doc.timeline.clips.map((clip) => [clip.timelineStartSec, clip.timelineEndSec])).toEqual([
			[0, 8],
			[8, 18],
		]);
		expect(doc.annotations[1]).toMatchObject({
			clipId: doc.timeline.clips[1].id,
			sourceStartSec: 0,
			sourceEndSec: 10,
			startMs: 8000,
		});
		for (const caption of doc.annotations) {
			expect(caption.position.x + caption.size.width).toBeLessThanOrEqual(100);
			expect(caption.position.y + caption.size.height).toBeLessThanOrEqual(100);
		}
		expect(doc.assets.every((asset) => asset.transcriptionFailure?.kind === "no-audio")).toBe(true);
		expect(f.saveDocument).toHaveBeenCalledTimes(1);
	});
	it("does not publish a complete draft after a failed shot", async () => {
		const f = await fixture();
		const review = await f.service.plan(brief);
		f.capture.mockRejectedValueOnce(new Error("encoder failed"));
		const result = await f.service.record(review.jobId!, plan);
		expect(result).toMatchObject({
			phase: "error",
			error: expect.stringContaining("encoder failed"),
		});
		expect(f.saveDocument).not.toHaveBeenCalled();
		expect(f.browser.close).toHaveBeenCalled();
	});
	it("cancels during planning without resurrecting a late model result", async () => {
		const f = await fixture();
		let resolvePlan!: (value: DemoPlan) => void;
		f.planner.mockImplementation(
			() =>
				new Promise<DemoPlan>((resolve) => {
					resolvePlan = resolve;
				}),
		);
		const pending = f.service.plan(brief);
		await vi.waitFor(() => expect(f.planner).toHaveBeenCalled());
		await expect(f.service.plan(brief)).rejects.toThrow("already running");
		f.service.cancel();
		resolvePlan(plan);
		expect((await pending).phase).toBe("cancelled");
		expect(f.saveDocument).not.toHaveBeenCalled();
	});
	it("cancels between shots and prevents remaining captures", async () => {
		const f = await fixture();
		const review = await f.service.plan(brief);
		f.capture.mockImplementationOnce(async (_browser, folder, durationSec) => {
			f.service.cancel();
			return { path: path.join(folder, "take.mp4"), durationSec, width: 1280, height: 720 };
		});
		expect((await f.service.record(review.jobId!, plan)).phase).toBe("cancelled");
		expect(f.capture).toHaveBeenCalledTimes(1);
		expect(f.saveDocument).not.toHaveBeenCalled();
	});
});
