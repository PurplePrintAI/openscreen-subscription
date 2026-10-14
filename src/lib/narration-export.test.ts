import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "./ai-edition/schema";
import { withNarration } from "./narration";
import { mixProjectNarration } from "./narration-export";

afterEach(() => {
	vi.unstubAllGlobals();
	vi.clearAllMocks();
});
const doc = withNarration(createEmptyDocument({ projectId: "qa", title: "QA" }), {
	version: 1,
	jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
	projectId: "qa",
	mode: "preset",
	text: "대본",
	audioPath: "C:/voice.wav",
	durationSec: 4,
	offsetSec: 1.5,
	originalGain: 0,
});
it("uses native mixing even when renderer AudioEncoder is unavailable", async () => {
	vi.stubGlobal("AudioEncoder", undefined);
	const mix = vi.fn(async () => ({ success: true }));
	vi.stubGlobal("window", { electronAPI: { mixNarrationExport: mix } });
	await mixProjectNarration(doc, "C:/out.mp4");
	expect(mix).toHaveBeenCalledWith({
		projectId: "qa",
		outputPath: "C:/out.mp4",
		expectedLayer: expect.objectContaining({ offsetSec: 1.5, originalGain: 0 }),
	});
});
it("missing native mixing reports preservation rather than using a browser fallback", async () => {
	vi.stubGlobal("window", { electronAPI: {} });
	await expect(mixProjectNarration(doc, "C:/out.mp4")).rejects.toThrow("preserved");
});
it("propagates native verification errors", async () => {
	vi.stubGlobal("window", {
		electronAPI: {
			mixNarrationExport: async () => ({ success: false, message: "Mix decode failed" }),
		},
	});
	await expect(mixProjectNarration(doc, "C:/out.mp4")).rejects.toThrow("Mix decode failed");
});
