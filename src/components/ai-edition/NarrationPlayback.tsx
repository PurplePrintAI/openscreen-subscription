import { useMemo } from "react";
import { toast } from "sonner";
import { toFileUrl } from "@/components/video-editor/projectPersistence";
import type { AxcutDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { getNarration } from "@/lib/narration";
import { buildNarrationClock, narrationOutputTime } from "@/lib/narration-clock";
import { TimelineAudio } from "./TimelineAudio";

export function NarrationPlayback() {
	const doc = useProjectStore((s) => s.document),
		rawTime = useProjectStore((s) => s.currentTimeSec),
		playing = useProjectStore((s) => s.playing);
	return <NarrationAudio doc={doc} rawTime={rawTime} playing={playing} />;
}

export function NarrationAudio({
	doc,
	rawTime,
	playing,
}: {
	doc: AxcutDocument | null;
	rawTime: number;
	playing: boolean;
}) {
	const layer = useMemo(() => getNarration(doc), [doc]);
	const spans = useMemo(() => (doc && layer ? buildNarrationClock(doc) : []), [doc, layer]);
	const target = narrationOutputTime(spans, rawTime) - (layer?.offsetSec ?? 0);
	return layer ? (
		<TimelineAudio
			src={toFileUrl(layer.audioPath)}
			time={target}
			playing={playing && target < layer.durationSec}
			onError={() =>
				toast.error("Narration audio is unavailable. Open Narration to regenerate or remove it.")
			}
		/>
	) : null;
}
