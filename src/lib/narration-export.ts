import type { AxcutDocument } from "./ai-edition/schema";
import { getNarration } from "./narration";

/** Desktop mixing uses the bundled FFmpeg, not optional renderer WebCodecs. */
export async function mixProjectNarration(doc: AxcutDocument, outPath: string): Promise<void> {
	const layer = getNarration(doc);
	if (!layer) return;
	const mix = window.electronAPI?.mixNarrationExport;
	if (!mix)
		throw new Error("Native narration mixing is unavailable. The original export was preserved.");
	const result = await mix({
		projectId: doc.project.id,
		outputPath: outPath,
		expectedLayer: layer,
	});
	if (!result.success)
		throw new Error(
			result.message || "Narration mixing failed. The original export was preserved.",
		);
}
