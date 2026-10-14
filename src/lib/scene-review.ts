import { z } from "zod";
import type { AxcutDocument } from "./ai-edition/schema";
import { getNarration } from "./narration";
import {
	type PlannedScene,
	type ScenePlan,
	scenePlanSchema,
	sceneReviewPlan,
	scheduleScenes,
	validateSceneAssets,
} from "./scene-plan";

const checkSchema = z
	.object({ key: z.string().max(131072), checkedAt: z.string().datetime() })
	.strict();
export const sceneChecksSchema = z
	.object({
		version: z.literal(1),
		entries: z
			.record(
				z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
				z
					.object({
						visual: checkSchema.optional(),
						narration: checkSchema.optional(),
					})
					.strict(),
			)
			.refine((entries) => Object.keys(entries).length <= 16),
	})
	.strict();
export type SceneChecks = z.infer<typeof sceneChecksSchema>;
export type ReviewKind = "visual" | "narration";
export type ReviewStatus = "pending" | "confirmed" | "stale" | "not-required";
export const emptySceneChecks = (): SceneChecks => ({ version: 1, entries: {} });
export function storedSceneChecks(doc: AxcutDocument): SceneChecks {
	const parsed = sceneChecksSchema.safeParse(doc.legacyEditor?.scenePlanChecks);
	return parsed.success ? parsed.data : emptySceneChecks();
}

/** Private project-local snapshots, never exported as review evidence. These
 * compare registered metadata, not file bytes or a cryptographic approval. */
function reviewKeys(plan: ScenePlan, source: AxcutDocument, id: string) {
	validateSceneAssets(plan, source);
	const scene = scheduleScenes(plan).find((s) => s.id === id);
	if (!scene) throw new Error("Scene no longer exists.");
	const asset = source.assets.find((a) => a.id === scene.assetId)!;
	const visual = JSON.stringify({
		version: 1,
		scene,
		asset,
		transcripts: source.transcripts.filter((t) => t.assetId === scene.assetId),
	});
	const voice = plan.keepNarration ? getNarration(source) : null;
	return { visual, narration: voice ? JSON.stringify({ visual, voice }) : null };
}
export function sceneCheckStatus(
	plan: ScenePlan,
	source: AxcutDocument,
	checks: SceneChecks,
	id: string,
): Record<ReviewKind, ReviewStatus> {
	const keys = reviewKeys(plan, source, id);
	const status = (kind: ReviewKind): ReviewStatus => {
		if (keys[kind] === null) return "not-required";
		const check = checks.entries[id]?.[kind];
		return !check ? "pending" : check.key === keys[kind] ? "confirmed" : "stale";
	};
	return { visual: status("visual"), narration: status("narration") };
}
export function markSceneChecked(
	plan: ScenePlan,
	source: AxcutDocument,
	checks: SceneChecks,
	id: string,
	kind: ReviewKind,
	checkedAt: string,
): SceneChecks {
	const key = reviewKeys(plan, source, id)[kind];
	if (key === null) throw new Error("No reused narration to review.");
	const entries = Object.fromEntries(plan.scenes.map((s) => [s.id, checks.entries[s.id] ?? {}]));
	return sceneChecksSchema.parse({
		version: 1,
		entries: { ...entries, [id]: { ...entries[id], [kind]: { key, checkedAt } } },
	});
}
export function withSceneChecks(doc: AxcutDocument, checks: SceneChecks): AxcutDocument {
	return {
		...doc,
		legacyEditor: { ...doc.legacyEditor, scenePlanChecks: sceneChecksSchema.parse(checks) },
	};
}
/** User check status is separate from final exported-frame verification. */
export function sceneReviewReport(plan: ScenePlan, source: AxcutDocument, checks: SceneChecks) {
	return {
		...sceneReviewPlan(plan),
		userChecks: plan.scenes.map((s) => ({
			id: s.id,
			...sceneCheckStatus(plan, source, checks, s.id),
		})),
	};
}

export interface SceneRevision {
	base: ScenePlan;
	sourceKey: string;
	sceneId: string;
	candidate: PlannedScene;
}
export interface AcceptedSceneRevision {
	before: ScenePlan;
	after: ScenePlan;
}
const sourceKey = (doc: AxcutDocument) =>
	JSON.stringify({
		projectId: doc.project.id,
		assets: doc.assets,
		transcripts: doc.transcripts,
		narration: getNarration(doc),
	});
const planKey = (plan: ScenePlan) => JSON.stringify(scenePlanSchema.parse(plan));
export function beginSceneRevision(
	plan: ScenePlan,
	source: AxcutDocument,
	id: string,
): SceneRevision {
	validateSceneAssets(plan, source);
	const scene = plan.scenes.find((s) => s.id === id);
	if (!scene) throw new Error("Scene no longer exists.");
	return {
		base: structuredClone(scenePlanSchema.parse(plan)),
		sourceKey: sourceKey(source),
		sceneId: id,
		candidate: structuredClone(scene),
	};
}
export function revisionPlan(revision: SceneRevision, source: AxcutDocument): ScenePlan {
	if (revision.candidate.id !== revision.sceneId)
		throw new Error("Cannot change a scene identity.");
	const plan = scenePlanSchema.parse({
		...revision.base,
		scenes: revision.base.scenes.map((s) => (s.id === revision.sceneId ? revision.candidate : s)),
	});
	validateSceneAssets(plan, source);
	return plan;
}
export function acceptSceneRevision(
	current: ScenePlan,
	source: AxcutDocument,
	revision: SceneRevision,
): ScenePlan {
	if (planKey(current) !== planKey(revision.base) || sourceKey(source) !== revision.sourceKey)
		throw new Error("The plan or media/narration changed. Start this revision again.");
	return revisionPlan(revision, source);
}
export function undoSceneRevision(
	current: ScenePlan,
	accepted: { before: ScenePlan; after: ScenePlan },
): ScenePlan {
	if (planKey(current) !== planKey(accepted.after))
		throw new Error("Later plan edits must be kept. This revision cannot be undone here.");
	return structuredClone(accepted.before);
}
