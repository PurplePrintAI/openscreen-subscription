import {
	type AxcutDocument,
	createEmptyDocument,
	documentSchema,
} from "../../src/lib/ai-edition/schema";
import { createFramingZoom, type FocusSample, stableFocus } from "../../src/lib/demo-framing";
import { type DemoPlan } from "../../src/lib/product-demo";

export interface DemoTake {
	path: string;
	durationSec: number;
	width: number;
	height: number;
	focusSamples?: FocusSample[];
}

/** One asset per take; captions remain editable clip-anchored overlays. No existing project is changed. */
export function createDemoDocument(
	projectId: string,
	plan: DemoPlan,
	takes: DemoTake[],
): AxcutDocument {
	if (takes.length !== plan.scenes.length)
		throw new Error("A completed take is required for every scene.");
	const doc = createEmptyDocument({ projectId, title: plan.title });
	let at = 0;
	for (const [index, take] of takes.entries()) {
		if (!Number.isFinite(take.durationSec) || take.durationSec <= 0)
			throw new Error("Invalid take duration.");
		const scene = plan.scenes[index];
		const assetId = `asset_demo_${index}`;
		const clipId = `clip_demo_${index}`;
		doc.assets.push({
			id: assetId,
			kind: "video",
			label: scene.title,
			originalPath: take.path,
			durationSec: take.durationSec,
			cameraTrack: null,
			video: { width: take.width, height: take.height, fps: 30, codec: "h264" },
			transcriptionFailure: { kind: "no-audio", message: "Silent product demo capture." },
		});
		doc.timeline.clips.push({
			id: clipId,
			assetId,
			sourceStartSec: 0,
			sourceEndSec: take.durationSec,
			timelineStartSec: at,
			timelineEndSec: at + take.durationSec,
			wordRefs: [],
			origin: "agent",
			reason: scene.title,
		});
		doc.annotations.push({
			id: `annotation_demo_${index}`,
			clipId,
			sourceStartSec: 0,
			sourceEndSec: take.durationSec,
			startMs: Math.round(at * 1000),
			endMs: Math.round((at + take.durationSec) * 1000),
			type: "text",
			content: scene.caption,
			textContent: scene.caption,
			// Annotation positions are the top-left of the box, not its centre.
			position: { x: 6, y: 80 },
			size: { width: 88, height: 18 },
			style: {
				color: "#ffffff",
				backgroundColor: "#17131f",
				fontSize: 40,
				fontFamily: "sans-serif",
				fontWeight: "bold",
				fontStyle: "normal",
				textDecoration: "none",
				textAlign: "center",
				textAnimation: "fade",
			},
			zIndex: 1,
		});
		if (scene.framing) {
			const bounds = stableFocus(take.focusSamples ?? [], scene.framing);
			if (bounds) {
				const zoom = createFramingZoom({
					id: `zoom_demo_${index}`,
					clipId,
					timelineStartSec: at,
					sourceStartSec: 0,
					durationSec: take.durationSec,
					framing: scene.framing,
					bounds,
				});
				if (zoom) doc.zoomRanges.push(zoom);
			}
		}
		at += take.durationSec;
	}
	doc.project.primaryAssetId = doc.assets[0]?.id;
	doc.legacyEditor = {
		aspectRatio: "16:9",
		wallpaper: "#17131f",
		padding: 40,
		borderRadius: 18,
		shadowIntensity: 0.2,
		motionBlurAmount: 0,
		showBlur: false,
		exportQuality: "good",
		exportFormat: "mp4",
	};
	return documentSchema.parse(doc);
}
