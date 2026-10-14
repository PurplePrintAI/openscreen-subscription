import { toFileUrl } from "../components/video-editor/projectPersistence";
import type { AxcutDocument } from "./ai-edition/schema";
import { mixVoiceoverIntoVideo } from "./exporter/voiceoverMix";
import { getNarration } from "./narration";

/** Uses the same mix as CLI exports. Native video packets are copied, not re-encoded. */
export async function mixProjectNarration(doc: AxcutDocument, outPath: string): Promise<void> {
	const layer = getNarration(doc);
	if (!layer) return;
	const [video, audio] = await Promise.all([
		fetch(toFileUrl(outPath)),
		fetch(toFileUrl(layer.audioPath)),
	]);
	if (!video.ok || !audio.ok)
		throw new Error(
			"Cannot read narration or the exported video. The silent export was preserved.",
		);
	const videoBlob = await video.blob();
	if (videoBlob.size > 512 * 1024 * 1024)
		throw new Error(
			"Narration mixing currently supports exported videos up to 512 MiB. Choose a lower resolution or shorter timeline.",
		);
	const mixed = await mixVoiceoverIntoVideo(videoBlob, {
		voiceoverData: await audio.arrayBuffer(),
		mode: layer.originalGain === 0 ? "replace" : "mix",
		offsetSec: layer.offsetSec,
		originalGain: layer.originalGain,
	});
	const saved = await window.electronAPI.writeExportToPath(await mixed.arrayBuffer(), outPath);
	if (!saved.success) throw new Error(saved.message || "Could not save narrated export.");
}
