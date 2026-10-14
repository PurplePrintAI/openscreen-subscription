import { describe, expect, it } from "vitest";
import { buildSceneDescription } from "../native/sceneDescription";
import { createEmptyDocument, documentSchema } from "./ai-edition/schema";
import { withNarration } from "./narration";
import {
	assembleScenePlan,
	initialScenePlan,
	scenePlanSchema,
	sceneReviewPlan,
	scheduleScenes,
	storedScenePlan,
	validateSceneAssets,
	withScenePlan,
} from "./scene-plan";

function source() {
	const doc = createEmptyDocument({ projectId: "source", title: "Three scenes" });
	doc.assets.push({
		id: "video",
		kind: "video",
		label: "Approved recording",
		originalPath: "D:/qa/source.mp4",
		durationSec: 30,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
		cameraTrack: null,
	});
	return doc;
}
describe("scene assembly", () => {
	it("derives an 18-second three-scene plan and persists it without changing the source timeline", () => {
		const doc = source(),
			before = structuredClone(doc),
			plan = initialScenePlan(doc);
		expect(scheduleScenes(plan).map((s) => [s.startFrame, s.endFrame])).toEqual([
			[0, 180],
			[180, 360],
			[360, 540],
		]);
		const saved = documentSchema.parse(JSON.parse(JSON.stringify(withScenePlan(doc, plan))));
		expect(storedScenePlan(saved)).toEqual(plan);
		expect(saved.timeline).toEqual(doc.timeline);
		expect(doc).toEqual(before);
	});
	it("reflows captions, zoom and review checkpoints from the changed duration", () => {
		const doc = source(),
			plan = initialScenePlan(doc);
		plan.scenes[1].caption = "승인한 결정이 문서로 이어집니다.";
		plan.scenes[1].zoom = { scale: 2, cx: 0.7, cy: 0.4 };
		const a = assembleScenePlan(plan, doc, "draft_a"),
			reviewA = sceneReviewPlan(plan);
		plan.scenes[0].outSec += 1;
		const b = assembleScenePlan(plan, doc, "draft_b"),
			reviewB = sceneReviewPlan(plan);
		expect(b.timeline.clips[1].timelineStartSec - a.timeline.clips[1].timelineStartSec).toBe(1);
		expect(b.annotations[0].startMs - a.annotations[0].startMs).toBe(1000);
		expect(b.zoomRanges[0].startMs - a.zoomRanges[0].startMs).toBe(1000);
		expect(b.zoomRanges[0].sourceStartSec).toBe(a.zoomRanges[0].sourceStartSec);
		expect(
			reviewB.scenes[1].checkFrames.map((f, i) => f - reviewA.scenes[1].checkFrames[i]),
		).toEqual([30, 30, 30]);
		expect(reviewB.totalFrames).toBe(570);
		const native = buildSceneDescription(b);
		expect(native.clips).toHaveLength(3);
		expect(native.zoomRegions[0]).toMatchObject({ scale: 2, clipIndex: 1 });
	});
	it("reorders scenes with their source windows, and does not mutate or overwrite the original", () => {
		const doc = source(),
			plan = initialScenePlan(doc),
			before = structuredClone(doc);
		plan.scenes.reverse();
		const draft = assembleScenePlan(plan, doc, "draft");
		expect(draft.timeline.clips.map((c) => c.sourceStartSec)).toEqual([12, 6, 0]);
		expect(doc).toEqual(before);
		expect(() => assembleScenePlan(plan, doc, "source")).toThrow("new project");
	});
	it("quantizes source and output boundaries consistently, keeping review frames inside their scenes", () => {
		const plan = initialScenePlan(source());
		plan.scenes[0].inSec = 0.017;
		plan.scenes[0].outSec = 6.02;
		const schedule = scheduleScenes(plan),
			review = sceneReviewPlan(plan);
		expect(schedule[0].inSec).toBe(1 / 30);
		expect(schedule[0].endFrame).toBe(180);
		for (const scene of review.scenes)
			expect(
				scene.checkFrames.every((f) => f >= scene.startFrame && f < scene.endFrameExclusive),
			).toBe(true);
		expect(review.transitionFrames).toEqual([179, 180, 359, 360]);
	});
	it("rejects duplicate IDs, missing assets, bad ranges and untrusted extra instructions", () => {
		const doc = source(),
			plan = initialScenePlan(doc);
		expect(scenePlanSchema.safeParse({ ...plan, command: "execute" }).success).toBe(false);
		expect(
			scenePlanSchema.safeParse({ ...plan, scenes: [plan.scenes[0], plan.scenes[0]] }).success,
		).toBe(false);
		plan.scenes[0].outSec = 31;
		expect(() => validateSceneAssets(plan, doc)).toThrow("duration");
		plan.scenes[0].outSec = 6;
		plan.scenes[0].assetId = "unknown";
		expect(() => validateSceneAssets(plan, doc)).toThrow("missing");
		plan.scenes[0].outSec = 0;
		expect(scenePlanSchema.safeParse(plan).success).toBe(false);
	});
	it("only reuses narration when requested, retaining its speed/offset and requiring timing review", () => {
		const doc = withNarration(source(), {
			version: 1,
			jobId: "f56ab18b-b8c8-4dca-a0e5-994e73af954e",
			projectId: "source",
			mode: "preset",
			text: "테스트",
			audioPath: "D:/private/generated.wav",
			durationSec: 12,
			offsetSec: 1,
			originalGain: 0,
		});
		const plan = initialScenePlan(doc);
		expect(assembleScenePlan(plan, doc, "silent").legacyEditor?.narration).toBeUndefined();
		plan.keepNarration = true;
		plan.scenes[0].outSec = 7;
		expect(assembleScenePlan(plan, doc, "voiced").legacyEditor?.narration).toMatchObject({
			projectId: "voiced",
			durationSec: 12,
			offsetSec: 1,
		});
		const review = sceneReviewPlan(plan);
		expect(review.narrationReview).toBe("required");
		expect(JSON.stringify(review)).not.toContain("private");
		expect(() => validateSceneAssets(plan, source())).toThrow("narration");
	});
	it("identifies short scenes whose requested zoom cannot fit", () => {
		const doc = source(),
			plan = initialScenePlan(doc);
		plan.scenes[0].outSec = 2;
		plan.scenes[0].zoom = { scale: 2, cx: 0.5, cy: 0.5 };
		expect(assembleScenePlan(plan, doc, "draft").zoomRanges).toHaveLength(0);
		expect(sceneReviewPlan(plan).scenes[0].zoomApplied).toBe(false);
	});
});
