import { z } from "zod";

export const STUDIO_SETUP_CHANNEL = "studio:setup";
export const NARRATION_FIELDS = [
	"pythonPath",
	"presetModel",
	"cloneModel",
	"whisperModel",
] as const;
export type NarrationField = (typeof NARRATION_FIELDS)[number];
export type SetupField = NarrationField | "hyperframesDir";
export type SetupKind = "narration" | "hyperframes";
export type SetupIssue =
	| "missing"
	| "invalid"
	| "unsupported"
	| "conflict"
	| "readonly"
	| "unavailable";
export interface SetupSection {
	paths: Partial<Record<SetupField, string>>;
	issues: Partial<Record<SetupField | "configuration", SetupIssue>>;
	configured: boolean;
	valid: boolean;
	changed: boolean;
	readOnly: boolean;
	weightBytes?: number;
}
export interface StudioSetupSnapshot {
	cli: Record<"codex" | "claude", { found: boolean; path?: string }>;
	narration: SetupSection;
	hyperframes: SetupSection;
}
// Paths cannot be supplied by a renderer: they come only from the main-side picker.
export const studioSetupRequestSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("status") }).strict(),
	z.object({ action: z.literal("reset") }).strict(),
	z.object({ action: z.literal("clear-clone") }).strict(),
	z
		.object({ action: z.literal("pick"), field: z.enum([...NARRATION_FIELDS, "hyperframesDir"]) })
		.strict(),
	z
		.object({
			action: z.literal("save"),
			kind: z.enum(["narration", "hyperframes"]),
			trustLocalRuntime: z.literal(true),
		})
		.strict(),
]);
export type StudioSetupRequest = z.infer<typeof studioSetupRequestSchema>;
export interface StudioSetupReply {
	snapshot: StudioSetupSnapshot;
	result?: "saved" | "cancelled" | "invalid" | "conflict" | "readonly" | "failed";
}
