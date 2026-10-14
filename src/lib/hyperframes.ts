import { z } from "zod";

export const HYPERFRAMES_CHANNEL = "studio:hyperframes";
export const HYPERFRAMES_VERSION = "0.8.146";
export const GSAP_VERSION = "3.14.2";

export const motionSceneSchema = z
	.object({
		title: z.string().trim().min(1).max(90),
		subtitle: z.string().trim().min(1).max(160),
		// Read old requests, but the composition no longer renders decorative labels.
		eyebrow: z.string().trim().max(50).optional(),
		durationSec: z.number().int().min(6).max(20),
		source: z
			.object({
				projectId: z.string().regex(/^[A-Za-z0-9_-]+$/),
				assetId: z.string().min(1).max(120),
				startSec: z.number().finite().nonnegative().max(86400),
			})
			.strict()
			.optional(),
	})
	.strict();
export type MotionScene = z.infer<typeof motionSceneSchema>;

export interface HyperframesRuntimeStatus {
	available: boolean;
	version: string;
	runtimeDir: string;
	error?: string;
}
export interface HyperframesStatus {
	phase:
		| "idle"
		| "preparing"
		| "linting"
		| "rendering"
		| "verifying"
		| "ready"
		| "cancelled"
		| "error";
	runtime: HyperframesRuntimeStatus;
	jobId?: string;
	folder?: string;
	projectId?: string;
	outputPath?: string;
	error?: string;
}
export const hyperframesRequestSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("status") }).strict(),
	z.object({ action: z.literal("render"), scene: motionSceneSchema }).strict(),
	z.object({ action: z.literal("cancel") }).strict(),
	z.object({ action: z.literal("reveal"), jobId: z.string().uuid() }).strict(),
]);
export type HyperframesRequest = z.infer<typeof hyperframesRequestSchema>;
