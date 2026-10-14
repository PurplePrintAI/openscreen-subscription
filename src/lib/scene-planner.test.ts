import { expect, it } from "vitest";
import { createEmptyDocument } from "./ai-edition/schema";
import { initialScenePlan } from "./scene-plan";
import {
	buildPlannerContext,
	parseSceneProposal,
	plannerSourceKey,
	type SceneProposal,
	validateSceneProposal,
} from "./scene-planner";

function fixture() {
	const doc = createEmptyDocument({ projectId: "qa", title: "Product" });
	doc.assets.push({
		id: "video",
		kind: "video",
		label: "Approved demo",
		originalPath: "D:/private/source.mp4",
		durationSec: 30,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
		cameraTrack: null,
	});
	doc.transcripts.push({
		assetId: "video",
		language: "ko",
		sourceJsonPath: "D:/private/transcript.json",
		segments: [
			{ id: "seg", kind: "speech", startSec: 1, endSec: 4, text: "민감한 전사문", wordIds: [] },
		],
		words: [],
	});
	const plan = initialScenePlan(doc);
	const brief = { request: "20초 제품 소개", maxDurationSec: 20, includeTranscript: false };
	const proposal: SceneProposal = {
		summary: "한 사례의 문제에서 결과로",
		plan,
		missingMaterials: ["화면 확인 필요"],
		sceneNotes: plan.scenes.map((s) => ({
			sceneId: s.id,
			basis: "brief",
			reason: "사용자가 구간을 확인해야 함",
		})),
	};
	return { doc, plan, brief, proposal };
}
it("projects only disclosed data, omits transcript by default and caps opted-in excerpts", () => {
	const { doc, plan, brief } = fixture();
	const payload = JSON.stringify(buildPlannerContext(doc, plan, brief));
	expect(payload).not.toContain("D:/private");
	expect(payload).not.toContain("민감한 전사문");
	doc.transcripts[0].segments = Array.from({ length: 125 }, (_, i) => ({
		id: String(i),
		kind: "speech",
		startSec: i,
		endSec: i + 1,
		text: "가".repeat(500),
		wordIds: [],
	}));
	const opted = buildPlannerContext(doc, plan, { ...brief, includeTranscript: true });
	expect(opted.transcripts).toHaveLength(120);
	expect(opted.transcripts[0].text).toHaveLength(400);
	expect(opted.transcriptOmittedCount).toBe(5);
});
it("validates an untrusted proposal without mutating the document or current plan", () => {
	const { doc, plan, brief, proposal } = fixture(),
		before = structuredClone(doc);
	expect(
		parseSceneProposal(`\`\`\`json\n${JSON.stringify(proposal)}\n\`\`\``, doc, plan, brief),
	).toEqual(proposal);
	expect(doc).toEqual(before);
	expect(() => parseSceneProposal('done {"plan":null}', doc, plan, brief)).toThrow();
	expect(() => parseSceneProposal("x".repeat(131073), doc, plan, brief)).toThrow(/128 KiB/);
});
it("rejects invented media, excessive length, unselected narration and unknown fields", () => {
	const { doc, plan, brief, proposal } = fixture();
	for (const mutate of [
		(p: SceneProposal) => {
			p.plan!.scenes[0].assetId = "invented";
		},
		(p: SceneProposal) => {
			p.plan!.scenes[0].outSec = 30;
		},
		(p: SceneProposal) => {
			p.plan!.keepNarration = true;
		},
	]) {
		const p = structuredClone(proposal);
		mutate(p);
		expect(() => validateSceneProposal(p, doc, plan, brief)).toThrow();
	}
	expect(() =>
		validateSceneProposal({ ...proposal, command: "publish" }, doc, plan, brief),
	).toThrow();
});
it("requires evidence notes for every scene and supplied overlapping transcript for transcript claims", () => {
	const { doc, plan, brief, proposal } = fixture();
	proposal.sceneNotes[0].basis = "transcript";
	expect(() => validateSceneProposal(proposal, doc, plan, brief)).toThrow(/not supplied/);
	expect(
		validateSceneProposal(proposal, doc, plan, { ...brief, includeTranscript: true }),
	).toBeTruthy();
	proposal.sceneNotes[1].basis = "transcript";
	expect(() =>
		validateSceneProposal(proposal, doc, plan, { ...brief, includeTranscript: true }),
	).toThrow(/overlaps/);
	proposal.sceneNotes.pop();
	expect(() => validateSceneProposal(proposal, doc, plan, brief)).toThrow(/one evidence/);
});
it("permits an honest no-plan response, and marks changed source or plan context stale", () => {
	const { doc, plan, brief } = fixture();
	expect(
		validateSceneProposal(
			{ summary: "소스 필요", plan: null, missingMaterials: ["제품 녹화"], sceneNotes: [] },
			doc,
			null,
			brief,
		).plan,
	).toBeNull();
	expect(() =>
		validateSceneProposal(
			{ summary: "완료", plan: null, missingMaterials: [], sceneNotes: [] },
			doc,
			null,
			brief,
		),
	).toThrow();
	const key = plannerSourceKey(doc, plan);
	doc.assets[0].durationSec = 40;
	expect(plannerSourceKey(doc, plan)).not.toBe(key);
});
