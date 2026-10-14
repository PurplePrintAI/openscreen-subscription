import { describe, expect, it } from "vitest";
import { createEmptyDocument, documentSchema } from "./ai-edition/schema";
import { withNarration } from "./narration";
import { initialScenePlan } from "./scene-plan";
import {
	acceptSceneRevision,
	beginSceneRevision,
	emptySceneChecks,
	markSceneChecked,
	sceneCheckStatus,
	sceneReviewReport,
	storedSceneChecks,
	undoSceneRevision,
	withSceneChecks,
} from "./scene-review";

function fixture() {
	let source = createEmptyDocument({ projectId: "qa", title: "Review" });
	source.assets.push({
		id: "a",
		kind: "video",
		label: "QA",
		originalPath: "D:/private/video.mp4",
		durationSec: 60,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
		cameraTrack: null,
	});
	source = withNarration(source, {
		version: 1,
		jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
		projectId: "qa",
		mode: "preset",
		text: "대본",
		audioPath: "D:/private/voice.wav",
		durationSec: 16,
		offsetSec: 1,
		originalGain: 0.4,
		tone: { preset: "confident" },
	});
	const plan = initialScenePlan(source);
	plan.keepNarration = true;
	let checks = emptySceneChecks();
	for (const scene of plan.scenes)
		for (const kind of ["visual", "narration"] as const)
			checks = markSceneChecked(plan, source, checks, scene.id, kind, "2026-10-14T00:00:00.000Z");
	return { source, plan, checks };
}
describe("scene proposals and user checks", () => {
	it("changes only the selected scene after acceptance and safely undoes it", () => {
		const { source, plan } = fixture(),
			before = structuredClone(source);
		const revision = beginSceneRevision(plan, source, "scene_2");
		revision.candidate.caption = "새 문장";
		expect(plan.scenes[1].caption).toBe("");
		const after = acceptSceneRevision(plan, source, revision);
		expect(after.scenes[1].caption).toBe("새 문장");
		expect(after.scenes[0]).toEqual(plan.scenes[0]);
		expect(after.scenes[2]).toEqual(plan.scenes[2]);
		expect(source).toEqual(before);
		expect(undoSceneRevision(after, { before: plan, after })).toEqual(plan);
		expect(() =>
			undoSceneRevision({ ...after, title: "Later edit" }, { before: plan, after }),
		).toThrow("Later plan edits");
	});
	it("rejects stale plans, changed assets or voice, identity changes and invalid ranges", () => {
		const { source, plan } = fixture();
		const revision = beginSceneRevision(plan, source, "scene_1");
		expect(() => acceptSceneRevision({ ...plan, title: "Elsewhere" }, source, revision)).toThrow(
			"changed",
		);
		const changed = structuredClone(source);
		changed.assets[0].originalPath = "D:/replacement.mp4";
		expect(() => acceptSceneRevision(plan, changed, revision)).toThrow("changed");
		const voice = structuredClone(source);
		(voice.legacyEditor!.narration as { offsetSec: number }).offsetSec = 2;
		expect(() => acceptSceneRevision(plan, voice, revision)).toThrow("changed");
		revision.candidate.id = "another";
		expect(() => acceptSceneRevision(plan, source, revision)).toThrow("identity");
		revision.candidate.id = "scene_1";
		revision.candidate.outSec = 100;
		expect(() => acceptSceneRevision(plan, source, revision)).toThrow("exceeds");
	});
	it("invalidates the edited scene and shifted later scenes but keeps unaffected checks", () => {
		const { source, plan, checks } = fixture();
		const revision = beginSceneRevision(plan, source, "scene_2");
		revision.candidate.outSec++;
		const next = acceptSceneRevision(plan, source, revision);
		expect(sceneCheckStatus(next, source, checks, "scene_1")).toEqual({
			visual: "confirmed",
			narration: "confirmed",
		});
		for (const id of ["scene_2", "scene_3"])
			expect(sceneCheckStatus(next, source, checks, id)).toEqual({
				visual: "stale",
				narration: "stale",
			});
		const fresh = markSceneChecked(
			next,
			source,
			checks,
			"scene_2",
			"visual",
			"2026-10-14T01:00:00.000Z",
		);
		expect(sceneCheckStatus(next, source, fresh, "scene_2")).toEqual({
			visual: "confirmed",
			narration: "stale",
		});
	});
	it("caption edits invalidate one scene, voice/tone replacement invalidates narration everywhere", () => {
		const { source, plan, checks } = fixture();
		const revision = beginSceneRevision(plan, source, "scene_2");
		revision.candidate.caption = "변경";
		const next = acceptSceneRevision(plan, source, revision);
		expect(sceneCheckStatus(next, source, checks, "scene_2").narration).toBe("stale");
		expect(sceneCheckStatus(next, source, checks, "scene_3").visual).toBe("confirmed");
		const changed = structuredClone(source);
		(changed.legacyEditor!.narration as { tone: unknown }).tone = { preset: "bright" };
		for (const s of plan.scenes)
			expect(sceneCheckStatus(plan, changed, checks, s.id)).toEqual({
				visual: "confirmed",
				narration: "stale",
			});
	});
	it("round trips checks without exporting their private snapshots or claiming export approval", () => {
		const { source, plan, checks } = fixture();
		const saved = documentSchema.parse(JSON.parse(JSON.stringify(withSceneChecks(source, checks))));
		expect(storedSceneChecks(saved)).toEqual(checks);
		const report = sceneReviewReport(plan, source, checks);
		expect(report.visualReview).toBe("pending");
		expect(report.userChecks.every((s) => s.visual === "confirmed")).toBe(true);
		expect(JSON.stringify(report)).not.toContain("D:/private");
		expect(JSON.stringify(report)).not.toContain('"key"');
		const silent = { ...plan, keepNarration: false };
		expect(sceneCheckStatus(silent, source, checks, "scene_1").narration).toBe("not-required");
		expect(() =>
			markSceneChecked(silent, source, checks, "scene_1", "narration", new Date().toISOString()),
		).toThrow("No reused narration");
	});
});
