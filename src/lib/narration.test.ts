import { describe, expect, it } from "vitest";
import { createEmptyDocument, documentSchema } from "./ai-edition/schema";
import {
	getNarration,
	narrationInputSchema,
	narrationLayerSchema,
	narrationToneMatches,
	withNarration,
} from "./narration";
import { buildNarrationClock, narrationOutputTime } from "./narration-clock";

const layer = {
	version: 1 as const,
	jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
	projectId: "qa",
	mode: "preset" as const,
	text: "대본",
	audioPath: "C:/private/voice.wav",
	durationSec: 8,
	offsetSec: 2,
	originalGain: 0.4,
};
describe("narration layer", () => {
	it("round trips tone and model without relabeling legacy audio or accepting clone styles", () => {
		const doc = createEmptyDocument({ projectId: "qa", title: "QA" });
		const tone = { preset: "bright" as const, direction: "조금 빠르게" };
		const saved = withNarration(doc, { ...layer, tone, model: "custom-1.7b" });
		expect(getNarration(documentSchema.parse(JSON.parse(JSON.stringify(saved))))).toMatchObject({
			tone,
			model: "custom-1.7b",
		});
		expect(narrationToneMatches(undefined, { preset: "confident" })).toBe(false);
		expect(narrationToneMatches(undefined, { preset: "neutral" })).toBe(true);
		expect(
			narrationInputSchema.safeParse({
				mode: "clone",
				projectId: "qa",
				text: "대본",
				referenceId: layer.jobId,
				referenceText: "원문",
				speakerConsent: true,
				tone,
			}).success,
		).toBe(false);
		expect(
			narrationInputSchema.safeParse({
				mode: "preset",
				projectId: "qa",
				text: "대본",
				tone: { preset: "bright", direction: "x".repeat(401) },
			}).success,
		).toBe(false);
	});
	it("preserves project, round trips, replaces and removes without touching clips", () => {
		const doc = createEmptyDocument({ projectId: "qa", title: "QA" });
		doc.legacyEditor = { padding: 7 };
		const saved = documentSchema.parse(JSON.parse(JSON.stringify(withNarration(doc, layer))));
		expect(getNarration(saved)).toEqual(layer);
		expect(saved.legacyEditor?.padding).toBe(7);
		expect(getNarration(withNarration(saved, null))).toBeNull();
		expect(doc.legacyEditor).toEqual({ padding: 7 });
		expect(() => withNarration(doc, { ...layer, projectId: "other" })).toThrow("another project");
	});
	it("rejects remote media and separates preset from clone permissions", () => {
		expect(
			narrationLayerSchema.safeParse({ ...layer, audioPath: "https://example.com/private.wav" })
				.success,
		).toBe(false);
		expect(
			narrationInputSchema.safeParse({
				mode: "clone",
				projectId: "qa",
				text: "대본",
				referenceId: layer.jobId,
				referenceText: "원본",
			}).success,
		).toBe(false);
		expect(
			narrationInputSchema.safeParse({
				mode: "preset",
				projectId: "qa",
				text: "대본",
				referenceId: layer.jobId,
			}).success,
		).toBe(false);
	});
	it("maps removed stretches and speed changes to output time", () => {
		const doc = createEmptyDocument({ projectId: "qa", title: "QA" });
		doc.assets = [
			{
				id: "a",
				kind: "video",
				originalPath: "C:/video.mp4",
				label: "v",
				durationSec: 20,
				video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
				cameraTrack: null,
			},
		];
		doc.timeline.clips = [
			{
				id: "c",
				assetId: "a",
				sourceStartSec: 0,
				sourceEndSec: 10,
				timelineStartSec: 0,
				timelineEndSec: 10,
				wordRefs: [],
				origin: "user",
				reason: "QA",
			},
		];
		doc.timeline.trimRanges = [
			{ id: "t", assetId: "a", clipId: "c", startSec: 2, endSec: 4, reason: "QA", origin: "user" },
		];
		doc.legacyEditor = { speedRegions: [{ id: "s", startMs: 4000, endMs: 8000, speed: 2 }] };
		const clock = buildNarrationClock(doc);
		expect(narrationOutputTime(clock, 1)).toBe(1);
		expect(narrationOutputTime(clock, 3)).toBe(2);
		expect(narrationOutputTime(clock, 6)).toBe(3);
		expect(narrationOutputTime(clock, 10)).toBe(6);
	});
});
