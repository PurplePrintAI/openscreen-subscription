import { z } from "zod";
export const NARRATION_INSTALL_CHANNEL = "studio:narration-install";
export const narrationInstallRequest = z.discriminatedUnion("action", [
	z.object({ action: z.literal("status") }).strict(),
	z.object({ action: z.literal("pick"), field: z.enum(["python", "storage", "model"]) }).strict(),
	z
		.object({
			action: z.literal("plan"),
			mode: z.enum(["download", "reuse"]),
			runtimeMode: z.enum(["existing", "managed"]).optional(),
			trustPython: z.literal(true),
		})
		.strict(),
	z
		.object({ action: z.literal("install"), planId: z.string().uuid(), confirm: z.literal(true) })
		.strict(),
	z.object({ action: z.literal("cancel") }).strict(),
]);
export type NarrationInstallRequest = z.infer<typeof narrationInstallRequest>;
export interface VoiceProbe {
	ready: boolean;
	python: string;
	cuda: boolean;
	gpu?: string;
	vramBytes?: number;
	error?: string;
}
export interface VoiceInstallPlan {
	id: string;
	mode: "download" | "reuse";
	modelPath: string;
	pythonPath: string;
	model: string;
	revision: string;
	bytes: number;
	downloadBytes: number;
	requiredFreeBytes: number;
	freeBytes: number;
	expiresAt: number;
	probe?: VoiceProbe;
	issues: string[];
	runtimeMode?: "existing" | "managed";
	runtimeRoot?: string;
	runtimeDownloadBytes?: number;
	hardware?: { name: string; memoryMiB: number; driver: string; compute: number };
}
export interface VoiceInstallStatus {
	phase:
		| "idle"
		| "planning"
		| "review"
		| "installing"
		| "verifying"
		| "provisioning"
		| "testing"
		| "complete"
		| "cancelled"
		| "error";
	paths: Partial<Record<"python" | "storage" | "model", string>>;
	plan?: VoiceInstallPlan;
	receivedBytes?: number;
	error?: string;
	step?: "downloading-runtime" | "extracting-python" | "installing-packages";
	sample?: { audioPath: string; durationSec: number };
	diagnosticStage?: "import-soundfile" | "import-torch" | "import-qwen" | "cuda";
}
