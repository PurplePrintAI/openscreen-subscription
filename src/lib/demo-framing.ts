import { z } from "zod";
import type { AxcutZoomRegion } from "./ai-edition/schema";

/** Timing is local to a recorded scene. Coordinates come from observation, never the LLM. */
export const demoFramingSchema = z
	.object({
		startSec: z.number().finite().min(3),
		endSec: z.number().finite().positive(),
		scale: z.number().finite().min(1.05).max(1.5),
	})
	.strict()
	.refine((value) => value.endSec - value.startSec >= 1, "Hold the focus for at least one second.");
export type DemoFraming = z.infer<typeof demoFramingSchema>;

export const focusBoundsSchema = z
	.object({
		x: z.number().finite().min(0).max(1),
		y: z.number().finite().min(0).max(1),
		width: z.number().finite().positive().max(1),
		height: z.number().finite().positive().max(1),
	})
	.strict()
	.refine((r) => r.x + r.width <= 1.001 && r.y + r.height <= 1.001);
export type FocusBounds = z.infer<typeof focusBoundsSchema>;
export interface FocusSample {
	atSec: number;
	bounds: FocusBounds | null;
}

/** Require three observed, stationary samples before the native zoom's lead-in. */
export function stableFocus(samples: FocusSample[], framing: DemoFraming): FocusBounds | null {
	if (samples.length !== 3) return null;
	const parsed = samples.map((sample) => focusBoundsSchema.safeParse(sample.bounds));
	if (parsed.some((sample) => !sample.success)) return null;
	if (
		samples.some(
			(s, i) =>
				!Number.isFinite(s.atSec) ||
				s.atSec < 0 ||
				s.atSec > framing.startSec - 1.05 ||
				(i > 0 && s.atSec - samples[i - 1].atSec < 0.15),
		)
	)
		return null;
	const last = parsed[2].data!;
	return parsed.every(
		({ data }) =>
			data &&
			(["x", "y", "width", "height"] as const).every(
				(key) => Math.abs(data[key] - last[key]) <= 0.008,
			),
	)
		? last
		: null;
}

/** A normal, clip-anchored Studio region: existing focus/scale/time controls and undo still work. */
export function createFramingZoom(input: {
	id: string;
	clipId: string;
	timelineStartSec: number;
	sourceStartSec: number;
	durationSec: number;
	framing: DemoFraming;
	bounds: FocusBounds;
}): AxcutZoomRegion | null {
	const framing = demoFramingSchema.parse(input.framing);
	const bounds = focusBoundsSchema.parse(input.bounds);
	if (framing.endSec > input.durationSec - 1.6)
		throw new Error("Leave 1.6 seconds for the camera to return to the full view.");
	// Keep the observed content inside the crop, including a small reading margin.
	const scale = Math.min(
		framing.scale,
		1 / Math.min(1, bounds.width + 0.08),
		1 / Math.min(1, bounds.height + 0.08),
	);
	if (scale < 1.05) return null;
	return {
		id: input.id,
		clipId: input.clipId,
		sourceStartSec: input.sourceStartSec + framing.startSec,
		sourceEndSec: input.sourceStartSec + framing.endSec,
		startMs: Math.round((input.timelineStartSec + framing.startSec) * 1000),
		endMs: Math.round((input.timelineStartSec + framing.endSec) * 1000),
		depth: 1,
		customScale: scale,
		focus: { cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2 },
		focusMode: "manual",
		source: "manual",
	};
}
