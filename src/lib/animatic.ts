import * as compositor from "../native/compositorViewClient";
import { pushAllNativeParams } from "../native/nativeCompositorStore";
import { buildSceneDescription } from "../native/sceneDescription";
import type { AxcutDocument } from "./ai-edition/schema";
import { getEditorSettings } from "./ai-edition/store/editorSettings";

export type AnimaticNative = Pick<
	typeof compositor,
	| "setCompositorScene"
	| "setCompositorPlaying"
	| "setCompositorParam"
	| "setActiveClip"
	| "setCompositorTime"
>;

/** Clip-local source time. Boundary frames belong to the following clip; the end
 * presents the last real frame, not a decoder position beyond the source window. */
export function animaticPosition(doc: AxcutDocument, requested: number) {
	const clips = doc.timeline.clips;
	const duration = clips.at(-1)?.timelineEndSec ?? 0;
	const time = Math.max(0, Math.min(Number.isFinite(requested) ? requested : 0, duration));
	const frameTime = Math.min(Math.floor(time * 30 + 1e-7) / 30, Math.max(0, duration - 1 / 30));
	const index = clips.findIndex(
		(c) => frameTime >= c.timelineStartSec && frameTime < c.timelineEndSec,
	);
	if (index < 0) throw new Error("No animatic clip at this time.");
	const clip = clips[index];
	return { index, time, sourceTime: clip.sourceStartSec + frameTime - clip.timelineStartSec };
}

/** A private native view, never the editor's global view/store. At most one
 * command chain is in flight; rapid seeks coalesce to the newest requested time. */
export function createAnimaticDriver(
	id: number,
	doc: AxcutDocument,
	onReady: () => void,
	onError: (error: string) => void,
	api: AnimaticNative = compositor,
) {
	let disposed = false,
		failed = false,
		running = false,
		configured = false;
	let pending: number | null = null,
		active = -1;
	const scene = buildSceneDescription(doc);
	async function drain() {
		if (running || disposed || failed) return;
		running = true;
		try {
			if (!configured) {
				await api.setCompositorPlaying(id, false);
				if (disposed) return;
				await api.setCompositorScene(id, JSON.stringify(scene));
				if (disposed) return;
				const settings: Promise<unknown>[] = [];
				pushAllNativeParams(getEditorSettings(doc), (key, value) => {
					settings.push(api.setCompositorParam(id, key, value));
				});
				await Promise.all(settings);
				if (disposed) return;
				configured = true;
			}
			while (pending !== null && !disposed) {
				const requested = pending;
				pending = null;
				const position = animaticPosition(doc, requested);
				const clip = scene.clips[position.index];
				if (!clip) throw new Error("Missing animatic media.");
				if (active !== position.index) {
					await api.setActiveClip(
						id,
						clip.screenPath,
						clip.webcamPath,
						clip.webcamOffsetSec,
						position.index,
						position.sourceTime,
					);
					if (disposed) return;
					active = position.index;
				}
				if (pending !== null) continue;
				await api.setCompositorTime(id, position.sourceTime);
				if (!disposed) onReady();
			}
		} catch (error) {
			if (!disposed) {
				failed = true;
				onError(error instanceof Error ? error.message : String(error));
			}
		} finally {
			running = false;
		}
	}
	return {
		seek(time: number) {
			if (disposed || failed) return;
			pending = time;
			void drain();
		},
		dispose() {
			disposed = true;
			pending = null;
		},
	};
}
