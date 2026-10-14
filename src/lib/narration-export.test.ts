import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "./ai-edition/schema";
import { withNarration } from "./narration";
import { mixProjectNarration } from "./narration-export";

const mix = vi.hoisted(() => vi.fn());
vi.mock("./exporter/voiceoverMix", () => ({ mixVoiceoverIntoVideo: mix }));
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
it("mixes the saved voice at the saved offset and checks disk write success", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(new Blob(["media"]))),
	);
	mix.mockResolvedValue(new Blob(["mixed"]));
	const write = vi.fn(async () => ({ success: true }));
	vi.stubGlobal("window", { electronAPI: { writeExportToPath: write } });
	await mixProjectNarration(doc, "C:/out.mp4");
	expect(mix).toHaveBeenCalledWith(
		expect.any(Blob),
		expect.objectContaining({ mode: "replace", offsetSec: 1.5, originalGain: 0 }),
	);
	expect(write).toHaveBeenCalledWith(expect.any(ArrayBuffer), "C:/out.mp4");
});
it("missing narration does not overwrite the already exported video", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => new Response(null, { status: 404 })),
	);
	const write = vi.fn();
	vi.stubGlobal("window", { electronAPI: { writeExportToPath: write } });
	await expect(mixProjectNarration(doc, "C:/out.mp4")).rejects.toThrow("preserved");
	expect(write).not.toHaveBeenCalled();
});
