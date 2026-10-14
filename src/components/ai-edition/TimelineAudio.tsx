import { useCallback, useEffect, useRef } from "react";

/** Audio follows an explicit timeline clock, including seeks made before metadata
 * arrives. No sound may start from zero while its requested position is unknown. */
export function TimelineAudio(props: {
	src: string;
	time: number;
	playing: boolean;
	gain?: number;
	onError?: () => void;
}) {
	return <ClockedAudio key={props.src} {...props} />;
}

function ClockedAudio({
	src,
	time,
	playing,
	gain = 1,
	onError,
}: Parameters<typeof TimelineAudio>[0]) {
	const ref = useRef<HTMLAudioElement>(null);
	const sync = useCallback(() => {
		const audio = ref.current;
		if (!audio) return;
		audio.volume = Math.max(0, Math.min(1, gain));
		if (!Number.isFinite(audio.duration) || audio.readyState === 0) {
			audio.pause();
			return;
		}
		const active = Number.isFinite(time) && time >= 0 && time < audio.duration;
		const position = Math.max(0, Math.min(Number.isFinite(time) ? time : 0, audio.duration));
		// During playback tolerate small clock jitter; paused seeks must be exact.
		if (Math.abs(audio.currentTime - position) > (playing ? 0.08 : 1 / 48000))
			audio.currentTime = position;
		if (playing && active) {
			if (audio.paused)
				void audio.play().catch(() => {
					// A concurrent seek/pause can cancel play(). The next clock tick retries.
				});
		} else audio.pause();
	}, [time, playing, gain]);
	useEffect(sync, [sync]);
	useEffect(() => {
		const audio = ref.current;
		return () => audio?.pause();
	}, []);
	return <audio ref={ref} src={src} preload="auto" onLoadedMetadata={sync} onError={onError} />;
}
