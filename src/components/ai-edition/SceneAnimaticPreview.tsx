import { useEffect, useMemo, useRef, useState } from "react";
import { toFileUrl } from "@/components/video-editor/projectPersistence";
import type { AxcutDocument } from "@/lib/ai-edition/schema";
import { animaticPosition, createAnimaticDriver } from "@/lib/animatic";
import { getNarration } from "@/lib/narration";
import { assembleScenePlan, type ScenePlan, scheduleScenes } from "@/lib/scene-plan";
import { probeCompositorBackend } from "@/native/compositorViewClient";
import { useNativeCompositorView } from "@/native/hooks/useNativeCompositorView";
import { NarrationAudio } from "./NarrationPlayback";
import styles from "./ScenePlanDialog.module.css";
import { TimelineAudio } from "./TimelineAudio";

export function SceneAnimaticPreview({
	plan,
	source,
	ko,
	focusSceneId,
}: {
	plan: ScenePlan;
	source: AxcutDocument;
	ko: boolean;
	focusSceneId?: string;
}) {
	// One-way planning snapshot: no project save or global project replacement.
	const draft = useMemo(
		() => assembleScenePlan(plan, source, `animatic_${source.project.id}`),
		[plan, source],
	);
	const schedule = useMemo(() => scheduleScenes(plan), [plan]);
	const focus = focusSceneId ? schedule.find((s) => s.id === focusSceneId) : undefined;
	return (
		<AnimaticPlayer
			key={JSON.stringify([plan, draft.assets, getNarration(draft), focusSceneId])}
			doc={draft}
			labels={schedule.map((s) => s.title)}
			ko={ko}
			range={focus ? { start: focus.startSec, end: focus.endSec } : undefined}
		/>
	);
}

function AnimaticPlayer({
	doc,
	labels,
	ko,
	range,
}: {
	doc: AxcutDocument;
	labels: string[];
	ko: boolean;
	range?: { start: number; end: number };
}) {
	const canvas = useRef<HTMLCanvasElement>(null);
	const driver = useRef<ReturnType<typeof createAnimaticDriver> | null>(null);
	const [backend, setBackend] = useState<string | null>(null);
	const start = range?.start ?? 0;
	const [time, setTime] = useState(start);
	const [playing, setPlaying] = useState(false);
	const [ready, setReady] = useState(false);
	const [error, setError] = useState("");
	const [audioErrorPath, setAudioErrorPath] = useState<string | null>(null);
	const timeRef = useRef(start);
	const duration = range?.end ?? doc.timeline.clips.at(-1)?.timelineEndSec ?? 0;
	const position = animaticPosition(doc, range && time >= duration ? duration - 1 / 30 : time);
	const clip = doc.timeline.clips[position.index];
	const asset = doc.assets.find((a) => a.id === clip.assetId)!;
	const first = doc.assets.find((a) => a.id === doc.timeline.clips[0].assetId)!;
	const narration = getNarration(doc);
	useEffect(() => {
		let closed = false;
		void probeCompositorBackend().then((value) => {
			if (!closed) setBackend(value);
		});
		return () => {
			closed = true;
		};
	}, []);
	const {
		viewId,
		error: nativeError,
		hasFrame,
	} = useNativeCompositorView(canvas, {
		enabled: backend !== null && backend !== "none",
		sources: { screenPath: first.originalPath, cursorPath: `${first.originalPath}.cursor.json` },
	});
	useEffect(() => {
		if (viewId === null || viewId < 0) return;
		setReady(false);
		setPlaying(false);
		setTime(start);
		timeRef.current = start;
		const instance = createAnimaticDriver(
			viewId,
			doc,
			() => setReady(true),
			(message) => {
				setError(message);
				setPlaying(false);
			},
		);
		driver.current = instance;
		instance.seek(start);
		return () => {
			instance.dispose();
			driver.current = null;
		};
	}, [viewId, doc, start]);
	useEffect(() => {
		if ((ready && hasFrame) || error || nativeError || backend === "none") return;
		const timeout = setTimeout(
			() =>
				setError(
					ko
						? "미리보기를 초기화하지 못했습니다. 탭을 다시 열거나 합성기 상태를 확인해 주세요."
						: "Preview did not initialize. Reopen the tab or check the compositor.",
				),
			15000,
		);
		return () => clearTimeout(timeout);
	}, [ready, hasFrame, error, nativeError, backend, ko]);
	const problem =
		error ||
		nativeError ||
		(backend === "none" || (viewId !== null && viewId < 0)
			? ko
				? "네이티브 합성기를 사용할 수 없습니다. 장면 시트에서 원본을 확인할 수 있습니다."
				: "Native compositor unavailable. Source frames remain in the scene sheet."
			: "");
	const canPlay = ready && hasFrame && !problem;
	useEffect(() => {
		if (!playing || problem) return;
		const started = performance.now(),
			from = timeRef.current;
		let frame = 0,
			last = -1;
		const tick = () => {
			const next = Math.min(duration, from + (performance.now() - started) / 1000);
			const index = Math.floor(next * 30);
			if (index !== last) {
				last = index;
				timeRef.current = next;
				setTime(next);
				driver.current?.seek(range && next >= duration ? duration - 1 / 30 : next);
			}
			if (next < duration) frame = requestAnimationFrame(tick);
			else setPlaying(false);
		};
		frame = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(frame);
	}, [playing, duration, problem, range]);
	const seek = (next: number) => {
		setPlaying(false);
		timeRef.current = next;
		setTime(next);
		driver.current?.seek(range && next >= duration ? duration - 1 / 30 : next);
	};
	const hasSourceAudio = asset.transcriptionFailure?.kind !== "no-audio";
	return (
		<div className={styles.animatic}>
			{range && (
				<p className={styles.note}>
					{ko ? "선택 장면 · 전체 영상 기준" : "Selected scene · Output time"} {start.toFixed(2)}–
					{duration.toFixed(2)}s
				</p>
			)}
			<p className={styles.note}>
				{ko
					? "실제 자막·줌·컷 전환을 Studio 합성기로 재생합니다. 원본 프로젝트는 변경하지 않습니다. 기획을 수정하면 재생 위치가 처음으로 돌아갑니다."
					: "Actual captions, zoom and cuts use Studio's compositor. The source project is unchanged. Plan edits reset playback."}
			</p>
			<div className={styles.animaticStage}>
				<canvas ref={canvas} aria-label={ko ? "합성 애니매틱" : "Composited animatic"} />
				{!canPlay && (
					<p role={problem ? "alert" : "status"}>
						{problem || (ko ? "합성기 준비 중…" : "Preparing compositor…")}
					</p>
				)}
			</div>
			<div className={styles.transport}>
				<button
					type="button"
					disabled={!canPlay}
					onClick={() => {
						if (timeRef.current >= duration) {
							timeRef.current = start;
							setTime(start);
							driver.current?.seek(start);
						}
						setPlaying((v) => !v);
					}}
				>
					{playing ? (ko ? "일시정지" : "Pause") : ko ? "애니매틱 재생" : "Play animatic"}
				</button>
				<input
					type="range"
					aria-label={ko ? "애니매틱 탐색" : "Seek animatic"}
					min={start}
					max={duration}
					step={1 / 30}
					value={time}
					disabled={!canPlay}
					onChange={(e) => seek(e.target.valueAsNumber)}
				/>
				<output>
					{time.toFixed(2)} / {duration.toFixed(2)}s
				</output>
			</div>
			{!range && (
				<div className={styles.actions}>
					{doc.timeline.clips.map((c, i) => (
						<button
							key={c.id}
							type="button"
							disabled={!canPlay}
							aria-pressed={position.index === i}
							onClick={() => seek(c.timelineStartSec)}
						>
							{i + 1}. {labels[i]}
						</button>
					))}
				</div>
			)}
			<p className={styles.note}>
				{ko
					? "합성 효과는 최종 출력과 공유하며, 화면 크기와 기기 성능에 따라 미리보기 해상도·재생 빈도는 달라집니다. 현재 장면 전환은 하드 컷입니다."
					: "Effects share the final-output compositor. Preview resolution and cadence depend on size and hardware. Scene transitions are hard cuts."}
			</p>
			{hasSourceAudio && (
				<TimelineAudio
					src={toFileUrl(asset.originalPath)}
					time={position.sourceTime}
					playing={playing && canPlay && time < duration}
					gain={narration?.originalGain ?? 1}
					onError={() => setAudioErrorPath(asset.originalPath)}
				/>
			)}
			{audioErrorPath === asset.originalPath && (
				<p role="status" className={styles.warning}>
					{ko
						? "원본 오디오를 미리 들을 수 없습니다. 출력 시 오디오를 확인해 주세요."
						: "Source audio preview unavailable. Check audio in the export."}
				</p>
			)}
			<NarrationAudio doc={doc} rawTime={time} playing={playing && canPlay} />
		</div>
	);
}
