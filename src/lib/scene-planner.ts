import { z } from "zod";
import { type AxcutDocument, documentSchema } from "./ai-edition/schema";
import { getNarration } from "./narration";
import { type ScenePlan, scenePlanSchema, scheduleScenes, validateSceneAssets } from "./scene-plan";

export const SCENE_PLANNER_CHANNEL = "studio:scene-planner";
export const planningBriefSchema = z
	.object({
		request: z.string().trim().min(1).max(6000),
		maxDurationSec: z.number().int().min(3).max(300),
		includeTranscript: z.boolean(),
	})
	.strict();
export type PlanningBrief = z.infer<typeof planningBriefSchema>;

export const sceneProposalSchema = z
	.object({
		summary: z.string().trim().min(1).max(1200),
		plan: scenePlanSchema.nullable(),
		missingMaterials: z.array(z.string().trim().min(1).max(500)).max(12),
		sceneNotes: z
			.array(
				z
					.object({
						sceneId: z.string().max(80),
						basis: z.enum(["brief", "transcript", "metadata"]),
						reason: z.string().trim().min(1).max(600),
					})
					.strict(),
			)
			.max(16),
	})
	.strict();
export type SceneProposal = z.infer<typeof sceneProposalSchema>;
export const plannerRequestSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("info") }).strict(),
	z.object({ action: z.literal("cancel"), requestId: z.string().uuid() }).strict(),
	z
		.object({
			action: z.literal("generate"),
			requestId: z.string().uuid(),
			consent: z.literal(true),
			routeKey: z.string().min(1).max(4096),
			brief: planningBriefSchema,
			document: documentSchema,
			currentPlan: scenePlanSchema.nullable(),
		})
		.strict(),
]);
export type PlannerRequest = z.infer<typeof plannerRequestSchema>;
export interface PlannerInfo {
	provider: string;
	model: string;
	routeKey: string;
}
export type PlannerReply =
	| { kind: "info"; info: PlannerInfo | null }
	| { kind: "cancelled" }
	| {
			kind: "proposal";
			requestId: string;
			proposal: SceneProposal;
			provider: string;
			model: string;
	  };

/** Exact provider payload projection: no paths, voice references, chat, video or image bytes. */
export function buildPlannerContext(
	doc: AxcutDocument,
	plan: ScenePlan | null,
	brief: PlanningBrief,
) {
	const assets = doc.assets.filter((a) => a.durationSec && a.video?.width && a.video?.height);
	if (assets.length > 64) throw new Error("Select a project with at most 64 video assets.");
	const transcripts = brief.includeTranscript
		? doc.transcripts
				.filter((t) => assets.some((a) => a.id === t.assetId))
				.flatMap((t) =>
					t.segments.map((s) => ({
						assetId: t.assetId,
						startSec: s.startSec,
						endSec: s.endSec,
						text: s.text.slice(0, 400),
					})),
				)
		: [];
	return {
		request: brief.request,
		maxDurationSec: brief.maxDurationSec,
		projectTitle: doc.project.title.slice(0, 100),
		assets: assets.map((a) => ({
			id: a.id,
			label: a.label.slice(0, 160),
			durationSec: a.durationSec,
			width: a.video!.width,
			height: a.video!.height,
		})),
		currentPlan: plan,
		transcripts: transcripts.slice(0, 120),
		transcriptOmittedCount: Math.max(0, transcripts.length - 120),
		visualEvidence: "none" as const,
	};
}

/** Local-only stale-result guard; never sent to the model. */
export function plannerSourceKey(doc: AxcutDocument, plan: ScenePlan | null): string {
	return JSON.stringify({
		projectId: doc.project.id,
		assets: doc.assets,
		transcripts: doc.transcripts,
		narration: getNarration(doc),
		plan,
	});
}

export function validateSceneProposal(
	raw: unknown,
	doc: AxcutDocument,
	currentPlan: ScenePlan | null,
	brief: PlanningBrief,
): SceneProposal {
	const proposal = sceneProposalSchema.parse(raw);
	if (!proposal.plan) {
		if (!proposal.missingMaterials.length || proposal.sceneNotes.length)
			throw new Error("A missing plan needs missing-material notes and no scene notes.");
		return proposal;
	}
	validateSceneAssets(proposal.plan, doc);
	if (proposal.plan.keepNarration && !currentPlan?.keepNarration)
		throw new Error("Narration reuse needs a separate user selection.");
	if ((scheduleScenes(proposal.plan).at(-1)?.endSec ?? 0) > brief.maxDurationSec)
		throw new Error("Proposal exceeds the requested duration.");
	const ids = proposal.plan.scenes.map((s) => s.id);
	if (
		proposal.sceneNotes.length !== ids.length ||
		new Set(proposal.sceneNotes.map((n) => n.sceneId)).size !== ids.length ||
		proposal.sceneNotes.some((n) => !ids.includes(n.sceneId))
	)
		throw new Error("Each scene needs one evidence note.");
	if (!brief.includeTranscript && proposal.sceneNotes.some((n) => n.basis === "transcript"))
		throw new Error("Transcript evidence was not supplied.");
	const supplied = buildPlannerContext(doc, currentPlan, brief).transcripts;
	for (const note of proposal.sceneNotes.filter((n) => n.basis === "transcript")) {
		const scene = proposal.plan.scenes.find((s) => s.id === note.sceneId)!;
		if (
			!supplied.some(
				(t) =>
					t.assetId === scene.assetId &&
					t.text.trim() &&
					t.startSec < scene.outSec &&
					t.endSec > scene.inSec,
			)
		)
			throw new Error("No supplied transcript overlaps this scene.");
	}
	return proposal;
}

export function parseSceneProposal(
	text: string,
	doc: AxcutDocument,
	plan: ScenePlan | null,
	brief: PlanningBrief,
) {
	if (text.length > 128 * 1024) throw new Error("Proposal is larger than 128 KiB.");
	const raw = text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1");
	return validateSceneProposal(JSON.parse(raw), doc, plan, brief);
}
