import { z } from "zod";
import { demoFramingSchema } from "./demo-framing";

export const PRODUCT_DEMO_CHANNEL = "studio:product-demo";

export function productUrl(value: string): string {
	const url = new URL(value);
	const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (
		(url.protocol !== "https:" && !(local && url.protocol === "http:")) ||
		url.username ||
		url.password
	) {
		throw new Error("Use an HTTPS product URL (HTTP is allowed only for localhost).");
	}
	return url.href;
}

export const demoBriefSchema = z
	.object({
		url: z.string().trim().min(1).max(2048).transform(productUrl),
		product: z.string().trim().min(1).max(100),
		intent: z.string().trim().min(10).max(4000),
		maxSeconds: z.number().int().min(15).max(299),
		language: z.enum(["ko", "en"]).default("ko"),
	})
	.strict();
export type DemoBrief = z.infer<typeof demoBriefSchema>;

export const demoTargetSchema = z.object({
	id: z.number().int().nonnegative(),
	kind: z.enum(["top", "heading", "tab"]),
	text: z.string().max(180),
	index: z.number().int().nonnegative(),
});
export type DemoTarget = z.infer<typeof demoTargetSchema>;
export interface DemoPage {
	url: string;
	title: string;
	text: string;
	targets: DemoTarget[];
}

export const demoPlanSchema = z
	.object({
		title: z.string().trim().min(1).max(100),
		summary: z.string().trim().min(1).max(500),
		scenes: z
			.array(
				z
					.object({
						title: z.string().trim().min(1).max(80),
						targetId: z.number().int().nonnegative(),
						durationSec: z.number().int().min(4).max(25),
						caption: z.string().trim().min(1).max(110),
						framing: demoFramingSchema.optional(),
					})
					.strict(),
			)
			.min(1)
			.max(16),
	})
	.strict();
export type DemoPlan = z.infer<typeof demoPlanSchema>;

export function validateDemoPlan(value: unknown, brief: DemoBrief, page: DemoPage): DemoPlan {
	const plan = demoPlanSchema.parse(value);
	if (plan.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) > brief.maxSeconds) {
		throw new Error("The shot plan exceeds the requested duration.");
	}
	if (plan.scenes.some((scene) => !page.targets.some((target) => target.id === scene.targetId))) {
		throw new Error("The shot plan refers to a target that was not observed on this page.");
	}
	if (
		plan.scenes.some(
			(scene) =>
				scene.framing && (scene.targetId === 0 || scene.framing.endSec > scene.durationSec - 1.6),
		)
	) {
		throw new Error(
			"Focus needs an observed target and 1.6 seconds to return before the scene ends.",
		);
	}
	return plan;
}

export type DemoPhase =
	| "idle"
	| "planning"
	| "review"
	| "recording"
	| "encoding"
	| "ready"
	| "cancelled"
	| "error";
export interface DemoStatus {
	phase: DemoPhase;
	jobId?: string;
	plan?: DemoPlan;
	sceneIndex?: number;
	sceneCount?: number;
	projectId?: string;
	folder?: string;
	error?: string;
	warnings?: string[];
}

export const demoRequestSchema = z.discriminatedUnion("action", [
	z.object({ action: z.literal("plan"), brief: demoBriefSchema }).strict(),
	z
		.object({ action: z.literal("record"), jobId: z.string().uuid(), plan: demoPlanSchema })
		.strict(),
	z.object({ action: z.literal("status") }).strict(),
	z.object({ action: z.literal("cancel") }).strict(),
]);
export type DemoRequest = z.infer<typeof demoRequestSchema>;
