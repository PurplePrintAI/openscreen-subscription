import { buildSceneDescription, resolveVisibleClips } from "../native/sceneDescription";
import type { AxcutDocument } from "./ai-edition/schema";
import { segmentRawSpanSec } from "./ai-edition/timeline/timelineMap";

export interface NarrationClockSpan {
	rawStart: number;
	rawEnd: number;
	outputStart: number;
	rate: number;
}
/** Narration is anchored to edited OUTPUT seconds, not raw source/trimmed seconds. */
export function buildNarrationClock(doc: AxcutDocument): NarrationClockSpan[] {
	const visible = resolveVisibleClips(doc),
		speeds = buildSceneDescription(doc).speedRegions;
	const spans: NarrationClockSpan[] = [];
	let outputStart = 0;
	visible.forEach((clip, index) => {
		const end = clip.sourceEndSec ?? clip.sourceStartSec;
		const regions = speeds.filter((r) => r.clipIndex === undefined || r.clipIndex === index);
		const points = [
			...new Set([
				clip.sourceStartSec,
				end,
				...regions
					.flatMap((r) => [r.startSec, r.endSec])
					.filter((n) => n > clip.sourceStartSec && n < end),
			]),
		].sort((a, b) => a - b);
		const raw = segmentRawSpanSec(clip, doc.timeline.clips);
		for (let i = 0; i < points.length - 1; i++) {
			const start = points[i],
				stop = points[i + 1];
			const speed = regions.find((r) => start >= r.startSec && start < r.endSec)?.speed ?? 1;
			const rate = Number.isFinite(speed) && speed > 0 ? speed : 1;
			spans.push({
				rawStart: raw.startSec + start - clip.sourceStartSec,
				rawEnd: raw.startSec + stop - clip.sourceStartSec,
				outputStart,
				rate,
			});
			outputStart += (stop - start) / rate;
		}
	});
	return spans;
}
export function narrationOutputTime(spans: NarrationClockSpan[], rawSec: number): number {
	for (const span of spans) {
		if (rawSec < span.rawStart) return span.outputStart;
		if (rawSec < span.rawEnd) return span.outputStart + (rawSec - span.rawStart) / span.rate;
	}
	const last = spans.at(-1);
	return last ? last.outputStart + (last.rawEnd - last.rawStart) / last.rate : 0;
}
