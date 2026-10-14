import { z } from "zod";
import { type AxcutDocument, createEmptyDocument, documentSchema } from "./ai-edition/schema";
import { getNarration } from "./narration";

const sceneSchema = z
	.object({
		id: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/),
		title: z.string().trim().min(1).max(100),
		assetId: z.string().min(1).max(160),
		inSec: z.number().finite().min(0).max(86400),
		outSec: z.number().finite().positive().max(86400),
		caption: z.string().max(300),
		zoom: z
			.object({
				scale: z.number().finite().min(1.05).max(3),
				cx: z.number().finite().min(0).max(1),
				cy: z.number().finite().min(0).max(1),
			})
			.strict()
			.optional(),
	})
	.strict()
	.refine((s) => Math.round(s.outSec * 30) > Math.round(s.inSec * 30), "Empty scene range");

/** Portable planning data only: registered asset IDs, never paths, HTML or commands. */
export const scenePlanSchema = z
	.object({
		version: z.literal(1),
		fps: z.literal(30),
		title: z.string().trim().min(1).max(100),
		keepNarration: z.boolean().default(false),
		scenes: z.array(sceneSchema).min(1).max(16),
	})
	.strict()
	.refine((p) => new Set(p.scenes.map((s) => s.id)).size === p.scenes.length, "Duplicate scene IDs")
	.refine(
		(p) =>
			p.scenes.reduce((n, s) => n + Math.round(s.outSec * 30) - Math.round(s.inSec * 30), 0) <=
			9000,
		"Plan exceeds five minutes",
	);
export type ScenePlan = z.infer<typeof scenePlanSchema>;
export type PlannedScene = ScenePlan["scenes"][number];

/** Frame boundaries are derived once; scene sheet, assembly and review use this result. */
export function scheduleScenes(input: ScenePlan) {
	const plan = scenePlanSchema.parse(input);
	let cursor = 0;
	return plan.scenes.map((scene) => {
		const inFrame = Math.round(scene.inSec * plan.fps);
		const outFrame = Math.round(scene.outSec * plan.fps);
		const startFrame = cursor;
		cursor += outFrame - inFrame;
		return {
			...scene,
			inSec: inFrame / plan.fps,
			outSec: outFrame / plan.fps,
			startFrame,
			endFrame: cursor,
			startSec: startFrame / plan.fps,
			endSec: cursor / plan.fps,
			durationSec: (cursor - startFrame) / plan.fps,
		};
	});
}

export function validateSceneAssets(plan: ScenePlan, doc: AxcutDocument): void {
	for (const scene of scheduleScenes(plan)) {
		const asset = doc.assets.find((a) => a.id === scene.assetId);
		if (!asset || !asset.durationSec || !asset.video?.width || !asset.video.height)
			throw new Error(`Source media is missing or not probed: ${scene.title}`);
		if (scene.outSec > asset.durationSec + 0.000001)
			throw new Error(`Source range exceeds media duration: ${scene.title}`);
	}
	if (plan.keepNarration && !getNarration(doc)) throw new Error("No saved narration to reuse.");
}

export function storedScenePlan(doc: AxcutDocument): ScenePlan | null {
	const parsed = scenePlanSchema.safeParse(doc.legacyEditor?.scenePlan);
	return parsed.success ? parsed.data : null;
}

export function initialScenePlan(doc: AxcutDocument): ScenePlan {
	const stored = storedScenePlan(doc);
	if (stored) return stored;
	const asset = doc.assets.find((a) => a.durationSec && a.durationSec > 0 && a.video?.width);
	const count = asset ? Math.min(3, Math.max(1, Math.floor((asset.durationSec ?? 0) / 6))) : 0;
	return {
		version: 1,
		fps: 30,
		title: doc.project.title,
		keepNarration: false,
		scenes: Array.from({ length: count }, (_, i) => ({
			id: `scene_${i + 1}`,
			title: `Scene ${i + 1}`,
			assetId: asset!.id,
			inSec: i * 6,
			outSec: Math.min((i + 1) * 6, Math.floor(asset!.durationSec! * 30) / 30),
			caption: "",
		})),
	};
}

export function withScenePlan(doc: AxcutDocument, plan: ScenePlan): AxcutDocument {
	validateSceneAssets(plan, doc);
	return { ...doc, legacyEditor: { ...doc.legacyEditor, scenePlan: scenePlanSchema.parse(plan) } };
}

/** A new project, never a replacement for the source's edited timeline. */
export function assembleScenePlan(
	input: ScenePlan,
	source: AxcutDocument,
	projectId: string,
): AxcutDocument {
	const plan = scenePlanSchema.parse(input);
	validateSceneAssets(plan, source);
	if (projectId === source.project.id) throw new Error("Assembly must use a new project ID.");
	const doc = createEmptyDocument({ projectId, title: plan.title });
	const selected = new Set(plan.scenes.map((s) => s.assetId));
	doc.assets = source.assets.filter((a) => selected.has(a.id)).map((a) => structuredClone(a));
	doc.transcripts = source.transcripts
		.filter((t) => selected.has(t.assetId))
		.map((t) => structuredClone(t));
	doc.project.primaryAssetId = doc.assets[0]?.id;
	doc.legacyEditor = {
		aspectRatio: "16:9",
		wallpaper: "#17131f",
		padding: 24,
		borderRadius: 16,
		shadowIntensity: 0.15,
		motionBlurAmount: 0,
		showBlur: false,
		exportQuality: "good",
		exportFormat: "mp4",
		scenePlan: plan,
	};
	for (const scene of scheduleScenes(plan)) {
		const clipId = `clip_${scene.id}`;
		doc.timeline.clips.push({
			id: clipId,
			assetId: scene.assetId,
			sourceStartSec: scene.inSec,
			sourceEndSec: scene.outSec,
			timelineStartSec: scene.startSec,
			timelineEndSec: scene.endSec,
			wordRefs: [],
			origin: "user",
			reason: scene.title,
		});
		if (scene.caption.trim())
			doc.annotations.push({
				id: `caption_${scene.id}`,
				clipId,
				sourceStartSec: scene.inSec,
				sourceEndSec: scene.outSec,
				startMs: Math.round(scene.startSec * 1000),
				endMs: Math.round(scene.endSec * 1000),
				type: "text",
				content: scene.caption,
				textContent: scene.caption,
				position: { x: 6, y: 81 },
				size: { width: 88, height: 15 },
				style: {
					color: "#ffffff",
					backgroundColor: "#17131f",
					fontFamily: "Malgun Gothic",
					fontSize: 42,
					fontWeight: "bold",
					fontStyle: "normal",
					textDecoration: "none",
					textAlign: "center",
					textAnimation: "fade",
				},
				zIndex: 1,
			});
		if (scene.zoom && scene.durationSec >= 3.2) {
			const lead = 1.2,
				tail = 1.2;
			doc.zoomRanges.push({
				id: `zoom_${scene.id}`,
				clipId,
				sourceStartSec: scene.inSec + lead,
				sourceEndSec: scene.outSec - tail,
				startMs: Math.round((scene.startSec + lead) * 1000),
				endMs: Math.round((scene.endSec - tail) * 1000),
				depth: 1,
				customScale: scene.zoom.scale,
				focus: { cx: scene.zoom.cx, cy: scene.zoom.cy },
				focusMode: "manual",
				source: "manual",
			});
		}
	}
	const narration = getNarration(source);
	if (plan.keepNarration && narration) doc.legacyEditor.narration = { ...narration, projectId };
	return documentSchema.parse(doc);
}

/** Planning evidence, not a visual QA pass. Excludes media paths and private voice references. */
export function sceneReviewPlan(input: ScenePlan) {
	const scenes = scheduleScenes(input);
	return {
		version: 1,
		fps: input.fps,
		totalFrames: scenes.at(-1)?.endFrame ?? 0,
		visualReview: "pending",
		narrationReview: input.keepNarration ? "required" : "none",
		scenes: scenes.map((scene) => ({
			id: scene.id,
			title: scene.title,
			assetId: scene.assetId,
			inSec: scene.inSec,
			outSec: scene.outSec,
			startFrame: scene.startFrame,
			endFrameExclusive: scene.endFrame,
			checkFrames: [0.15, 0.5, 0.85].map(
				(t) => scene.startFrame + Math.floor((scene.endFrame - scene.startFrame - 1) * t),
			),
			caption: scene.caption,
			requestedZoom: scene.zoom ?? null,
			zoomApplied: Boolean(scene.zoom && scene.durationSec >= 3.2),
		})),
		transitionFrames: scenes.slice(1).flatMap((s) => [s.startFrame - 1, s.startFrame]),
	};
}
