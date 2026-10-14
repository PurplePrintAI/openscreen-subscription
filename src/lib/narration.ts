import { z } from "zod";
import type { AxcutDocument } from "./ai-edition/schema";

export const NARRATION_CHANNEL = "studio:narration";
export const NARRATION_TONE_PROMPTS = {
	confident:
		"Speak Korean as an engaging, confident product launch presenter. Use an energetic, forward-moving rhythm, crisp consonants and purposeful emphasis on key benefits. Project assurance and enthusiasm, with clear, decisive sentence endings. Keep it natural and professional, without shouting.",
	bright:
		"Speak Korean in a bright, warm and friendly voice with an audible smile. Use lively, natural pitch variation and a moderately brisk pace. Enunciate clearly, keep pauses short and end phrases with positive energy. This is a welcoming product introduction.",
	neutral: "",
} as const;
export const narrationToneSchema = z
	.object({
		preset: z.enum(["confident", "bright", "neutral"]),
		direction: z.string().trim().max(400).optional(),
	})
	.strict();
export type NarrationTone = z.infer<typeof narrationToneSchema>;
export function resolveNarrationTone(tone?: NarrationTone): NarrationTone {
	const parsed = narrationToneSchema.parse(tone ?? { preset: "confident" });
	return { preset: parsed.preset, ...(parsed.direction ? { direction: parsed.direction } : {}) };
}
export function narrationToneInstruction(tone: NarrationTone): string {
	const value = resolveNarrationTone(tone);
	return [
		NARRATION_TONE_PROMPTS[value.preset],
		value.direction ? `Additional delivery direction (takes precedence): ${value.direction}` : "",
	]
		.filter(Boolean)
		.join("\n");
}
/** Legacy audio has no recorded tone; never relabel it as the new B default. */
export function narrationToneMatches(
	saved: NarrationTone | undefined,
	selected: NarrationTone,
): boolean {
	return (
		JSON.stringify(resolveNarrationTone(saved ?? { preset: "neutral" })) ===
		JSON.stringify(resolveNarrationTone(selected))
	);
}
export const narrationTakeSchema = z.object({
	jobId: z.string().uuid(),
	projectId: z.string().min(1),
	mode: z.enum(["preset", "clone"]),
	text: z.string().min(1).max(600),
	audioPath: z
		.string()
		.refine(
			(value) => /^(?:[A-Za-z]:[\\/]|\/(?!\/))/.test(value),
			"Expected a local absolute audio path",
		),
	durationSec: z.number().positive().max(140),
	tone: narrationToneSchema.optional(),
	model: z.string().max(200).optional(),
});
export const narrationLayerSchema = narrationTakeSchema.extend({
	version: z.literal(1),
	offsetSec: z.number().finite().min(0).max(3600),
	originalGain: z.number().min(0).max(1),
});
export type NarrationTake = z.infer<typeof narrationTakeSchema>;
export type NarrationLayer = z.infer<typeof narrationLayerSchema>;
export const NARRATION_EXPORT_CHANNEL = "studio:narration-export";
export const narrationExportRequestSchema = z
	.object({
		projectId: z.string().regex(/^[\w-]+$/),
		outputPath: z
			.string()
			.max(4096)
			.refine((value) => /^(?:[A-Za-z]:[\\/]|\/(?!\/))/.test(value)),
		expectedLayer: narrationLayerSchema,
	})
	.strict();
export type NarrationExportRequest = z.infer<typeof narrationExportRequestSchema>;
export const narrationInputSchema = z.discriminatedUnion("mode", [
	z
		.object({
			mode: z.literal("preset"),
			projectId: z.string().regex(/^[\w-]+$/),
			text: z.string().trim().min(1).max(600),
			tone: narrationToneSchema.optional(),
		})
		.strict(),
	z
		.object({
			mode: z.literal("clone"),
			projectId: z.string().regex(/^[\w-]+$/),
			text: z.string().trim().min(1).max(600),
			referenceId: z.string().uuid(),
			referenceText: z.string().trim().min(1).max(2000),
			speakerConsent: z.literal(true),
		})
		.strict(),
]);
export type NarrationInput = z.infer<typeof narrationInputSchema>;
export interface NarrationStatus {
	phase: "idle" | "reference" | "generating" | "verifying" | "ready" | "cancelled" | "error";
	runtime: {
		available: boolean;
		error?: string;
		presetToneControl?: boolean;
		presetModelSize?: string;
	};
	reference?: { id: string; label: string; text: string };
	take?: NarrationTake;
	error?: string;
}
export const narrationRequestSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("status") }).strict(),
	z.object({ action: z.literal("cancel") }).strict(),
	z.object({ action: z.literal("pick-reference"), speakerConsent: z.literal(true) }).strict(),
	z.object({ action: z.literal("generate"), input: narrationInputSchema }).strict(),
]);
export type NarrationRequest = z.infer<typeof narrationRequestSchema>;
export function getNarration(doc: AxcutDocument | null): NarrationLayer | null {
	const result = narrationLayerSchema.safeParse(doc?.legacyEditor?.narration);
	return result.success ? result.data : null;
}
export function withNarration(doc: AxcutDocument, layer: NarrationLayer | null): AxcutDocument {
	if (layer && layer.projectId !== doc.project.id)
		throw new Error("Narration belongs to another project.");
	return {
		...doc,
		legacyEditor: {
			...doc.legacyEditor,
			narration: layer ? narrationLayerSchema.parse(layer) : null,
		},
	};
}
