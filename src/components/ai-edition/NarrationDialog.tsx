import { useCallback, useEffect, useRef, useState } from "react";
import { toFileUrl } from "@/components/video-editor/projectPersistence";
import { useI18n } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import {
	getNarration,
	type NarrationRequest,
	type NarrationStatus,
	type NarrationTone,
	narrationToneInstruction,
	narrationToneMatches,
	resolveNarrationTone,
	withNarration,
} from "@/lib/narration";
import { ModalShell } from "./Modals";
import styles from "./ProductDemoDialog.module.css";

export function NarrationDialog({
	open,
	onClose,
	onOpenSetup,
}: {
	open: boolean;
	onClose: () => void;
	onOpenSetup?: () => void;
}) {
	const { locale } = useI18n(),
		ko = locale.startsWith("ko");
	const document = useProjectStore((s) => s.document);
	const attached = getNarration(document);
	const [mode, setMode] = useState<"preset" | "clone">("preset");
	const [text, setText] = useState("");
	const [consent, setConsent] = useState(false);
	const [referenceText, setReferenceText] = useState("");
	const [offset, setOffset] = useState(0);
	const [originalGain, setOriginalGain] = useState(0.4);
	const [heard, setHeard] = useState<string | null>(null);
	const [tonePreset, setTonePreset] = useState<NarrationTone["preset"]>("confident");
	const [toneDirection, setToneDirection] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const [status, setStatus] = useState<NarrationStatus>({
		phase: "idle",
		runtime: { available: false },
	});
	const audio = useRef<HTMLAudioElement>(null),
		epoch = useRef(0);
	const busy = pending || ["reference", "generating", "verifying"].includes(status.phase);
	const call = useCallback((request: NarrationRequest) => {
		if (!window.electronAPI?.narration)
			return Promise.reject(new Error("Narration requires the desktop app."));
		return window.electronAPI.narration(request);
	}, []);
	const projectId = document?.project.id;
	// The project can change while this modal is closed; never carry an applied take to another project.
	useEffect(() => {
		if (!open || !projectId) {
			audio.current?.pause();
			return;
		}
		const layer = getNarration(useProjectStore.getState().document);
		setText(layer?.text ?? "");
		setMode(layer?.mode ?? "preset");
		setOffset(layer?.offsetSec ?? 0);
		setOriginalGain(layer?.originalGain ?? 0.4);
		setTonePreset(layer?.mode === "preset" ? (layer.tone?.preset ?? "neutral") : "confident");
		setToneDirection(layer?.tone?.direction ?? "");
		setHeard(null);
		setError("");
		useProjectStore.getState().setPlaying(false);
	}, [open, projectId]);
	// Changing delivery never edits a WAV; a new take must be generated and heard.
	// biome-ignore lint/correctness/useExhaustiveDependencies: these are the inputs whose changes invalidate audition approval.
	useEffect(() => {
		audio.current?.pause();
		setHeard(null);
	}, [text, mode, tonePreset, toneDirection, referenceText, status.reference?.id]);
	useEffect(() => {
		if (!open) return;
		let disposed = false,
			polling = false;
		const poll = async () => {
			if (polling) return;
			polling = true;
			const token = epoch.current;
			try {
				const next = await call({ action: "status" });
				if (!disposed && token === epoch.current) setStatus(next);
			} catch (err) {
				if (!disposed) setError(String(err));
			} finally {
				polling = false;
			}
		};
		void poll();
		const timer = setInterval(() => void poll(), 1200);
		return () => {
			disposed = true;
			clearInterval(timer);
		};
	}, [open, call]);
	const perform = async (request: NarrationRequest) => {
		const token = ++epoch.current;
		setPending(true);
		setError("");
		setHeard(null);
		try {
			const next = await call(request);
			if (token === epoch.current) {
				++epoch.current;
				setStatus(next);
				if (next.reference) setReferenceText(next.reference.text);
			}
		} catch (err) {
			if (token === epoch.current) setError(String(err));
		} finally {
			if (token <= epoch.current) setPending(false);
		}
	};
	const tone = resolveNarrationTone({ preset: tonePreset, direction: toneDirection });
	const needsToneControl = mode === "preset" && Boolean(narrationToneInstruction(tone));
	const unsupportedTone = needsToneControl && status.runtime.presetToneControl !== true;
	const matchesTone = (value: { mode: "preset" | "clone"; tone?: NarrationTone }) =>
		value.mode !== "preset" || narrationToneMatches(value.tone, tone);
	const take =
		status.take?.projectId === document?.project.id &&
		status.take?.text === text.trim() &&
		status.take.mode === mode &&
		matchesTone(status.take)
			? status.take
			: null;
	const preview = take ?? attached;
	const candidate =
		take ??
		(attached?.text === text.trim() && attached.mode === mode && matchesTone(attached)
			? attached
			: null);
	const toneLabel = (value?: NarrationTone) => {
		if (!value) return ko ? "톤 정보 없음 · 기존 음성" : "Legacy audio · Tone not recorded";
		const labels = ko
			? {
					confident: "B · 자신감 있는 제품 소개",
					bright: "A · 밝고 또렷한 설명",
					neutral: "기존 기본 톤",
				}
			: {
					confident: "B · Confident product introduction",
					bright: "A · Bright and clear",
					neutral: "Original tone",
				};
		return labels[value.preset] + (value.direction ? (ko ? " · 사용자 조절" : " · Tuned") : "");
	};
	const apply = async (remove = false) => {
		const state = useProjectStore.getState(),
			doc = state.document;
		if (
			!doc ||
			doc.project.id !== document?.project.id ||
			(!remove && (!candidate || heard !== candidate.jobId))
		)
			return;
		setPending(true);
		try {
			const next = withNarration(
				doc,
				remove ? null : { ...candidate!, version: 1, offsetSec: offset, originalGain },
			);
			if (await state.saveDocument(next, { history: true })) {
				audio.current?.pause();
				onClose();
			} else setError(ko ? "프로젝트를 저장하지 못했습니다." : "Could not save the project.");
		} catch (err) {
			setError(String(err));
		} finally {
			setPending(false);
		}
	};
	if (!open) return null;
	return (
		<ModalShell
			open={open}
			onClose={() => {
				if (!busy) onClose();
			}}
			title={ko ? "나레이션" : "Narration"}
			subtitle={
				ko
					? "로컬에서 생성하고, 들어본 뒤 영상에 적용하세요."
					: "Generate locally, listen, then apply to your video."
			}
		>
			<div className={styles.content}>
				<p className={styles.note}>
					{status.runtime.available
						? ko
							? "Qwen3-TTS · 로컬 런타임 구성됨 · GPU는 생성 시 확인합니다."
							: "Qwen3-TTS · Local runtime configured; GPU checked on generation."
						: ko
							? "로컬 음성 런타임 설치·구성이 필요합니다. 자동 다운로드하지 않습니다."
							: status.runtime.error}
				</p>
				{!status.runtime.available && onOpenSetup && (
					<div className={styles.actions}>
						<button type="button" disabled={busy} onClick={onOpenSetup}>
							{ko ? "Studio 환경 설정 열기" : "Open Studio setup"}
						</button>
					</div>
				)}
				<label>
					{ko ? "목소리" : "Voice"}
					<select
						value={mode}
						disabled={busy}
						onChange={(e) => {
							setMode(e.target.value as "preset" | "clone");
							setHeard(null);
						}}
					>
						<option value="preset">
							{ko ? "기본 한국어 목소리 · Sohee" : "Korean preset · Sohee"}
						</option>
						<option value="clone">{ko ? "내 목소리 복제" : "Clone my voice"}</option>
					</select>
				</label>
				{mode === "preset" ? (
					<>
						<label>
							{ko ? "나레이션 톤" : "Narration tone"}
							<select
								value={tonePreset}
								disabled={busy}
								onChange={(e) => setTonePreset(e.target.value as NarrationTone["preset"])}
							>
								<option value="confident">
									{ko
										? "B · 자신감 있는 제품 소개 (기본)"
										: "B · Confident product introduction (Default)"}
								</option>
								<option value="bright">
									{ko ? "A · 밝고 또렷한 설명" : "A · Bright and clear"}
								</option>
								<option value="neutral">
									{ko ? "기존 기본 톤 · 스타일 지시 없음" : "Original tone · No style instruction"}
								</option>
							</select>
						</label>
						<label>
							{ko ? "세부 톤 조절 · 선택" : "Fine-tune delivery · Optional"}
							<textarea
								rows={3}
								maxLength={400}
								value={toneDirection}
								disabled={busy}
								onChange={(e) => setToneDirection(e.target.value)}
								placeholder={
									ko
										? "예: 조금 빠르게, 미소가 느껴지게. 핵심 단어는 또렷하게, 과장 없이."
										: "For example: slightly faster, with a warm smile; emphasize key words without exaggerating."
								}
							/>
						</label>
						<p className={styles.note}>
							{ko
								? "선택한 톤에 말투 지시를 추가합니다. 지시문은 읽을 대본이 아닙니다. 속도·감정의 정확한 수치를 보장하지 않으므로 생성 후 들어보고 적용하세요. 기존 음성은 바뀌지 않습니다."
								: "Adjust the selected delivery, not the spoken script. Exact pace or emotion values are not guaranteed; listen before applying. Existing audio stays unchanged."}
						</p>
						{unsupportedTone && (
							<p role="status" className={styles.note}>
								{ko
									? "톤 조절에는 로컬 Qwen3-TTS 1.7B CustomVoice가 필요합니다. 0.6B 또는 확인되지 않은 모델에서는 이 지시를 적용할 수 없습니다. 런타임을 구성하거나 기존 기본 톤을 선택하고 세부 지시를 비우세요. 자동 다운로드하지 않습니다."
									: "Tone control requires local Qwen3-TTS 1.7B CustomVoice. Configure it, or select Original tone with no extra direction. No automatic download."}
							</p>
						)}
					</>
				) : (
					<p className={styles.note}>
						{ko
							? "내 목소리 복제는 참고 녹음의 말투를 따릅니다. 현재 복제 엔진에는 A/B 톤 지시를 적용하지 않습니다."
							: "Voice cloning follows the reference delivery. A/B tone instructions are not supported by the current clone engine."}
					</p>
				)}
				{mode === "clone" && (
					<>
						<label style={{ display: "flex", alignItems: "center" }}>
							<input
								style={{ width: "auto" }}
								type="checkbox"
								checked={consent}
								disabled={busy}
								onChange={(e) => setConsent(e.target.checked)}
							/>
							{ko
								? "내 목소리이거나, 화자에게 복제 허락을 받았습니다."
								: "This is my voice, or I have the speaker's permission to clone it."}
						</label>
						<div className={styles.actions}>
							<button
								type="button"
								disabled={busy || !consent || !status.runtime.available}
								onClick={() => void perform({ action: "pick-reference", speakerConsent: true })}
							>
								{ko ? "녹음 선택 · 자동 전사" : "Choose recording · Transcribe"}
							</button>
						</div>
						<p className={styles.note}>
							{status.reference?.label ??
								(ko
									? "음악·다른 목소리 없는 3–30초 WAV/M4A/MP3/FLAC. 원본은 변경하지 않습니다."
									: "3–30 seconds, one speaker, no music. WAV/M4A/MP3/FLAC. Originals stay unchanged.")}
						</p>
						<label>
							{ko ? "녹음 내용 · 전사 확인" : "Reference transcript · Review"}
							<textarea
								rows={3}
								value={referenceText}
								disabled={busy}
								onChange={(e) => setReferenceText(e.target.value)}
							/>
						</label>
					</>
				)}
				<label>
					{ko ? "대본" : "Script"}
					<textarea
						rows={4}
						maxLength={600}
						value={text}
						disabled={busy}
						onChange={(e) => {
							setText(e.target.value);
							setHeard(null);
						}}
						placeholder={
							ko
								? "영상에서 들려줄 한국어 대본을 입력하세요."
								: "Enter your Korean narration script."
						}
					/>
				</label>
				<p className={styles.note}>
					{text.length}/600 ·{" "}
					{ko
						? "짧은 문단 단위로 생성합니다. 녹음과 대본은 외부로 보내지 않습니다."
						: "Generate a short passage at a time. Recordings and scripts stay local."}
				</p>
				<div className={styles.actions}>
					<button
						type="button"
						disabled={
							busy ||
							!document ||
							!status.runtime.available ||
							unsupportedTone ||
							!text.trim() ||
							(mode === "clone" && (!consent || !status.reference || !referenceText.trim()))
						}
						onClick={() => {
							if (!document) return;
							void perform({
								action: "generate",
								input:
									mode === "preset"
										? { mode, text, projectId: document.project.id, tone }
										: {
												mode,
												text,
												projectId: document.project.id,
												referenceId: status.reference!.id,
												referenceText,
												speakerConsent: true,
											},
							});
						}}
					>
						{ko ? "나레이션 생성" : "Generate narration"}
					</button>
					{busy && (
						<button type="button" onClick={() => void perform({ action: "cancel" })}>
							{ko ? "생성 취소" : "Cancel generation"}
						</button>
					)}
				</div>
				{busy && (
					<p role="status">
						{ko
							? status.phase === "reference"
								? "녹음을 로컬에서 전사하는 중…"
								: "로컬 음성 작업 중… 처음에는 모델 로딩에 시간이 걸립니다."
							: "Working locally… Initial model loading can take a while."}
					</p>
				)}
				{(error || status.error) && (
					<p role="alert" className={styles.error}>
						{error || status.error}
					</p>
				)}
				{preview && (
					<>
						<p className={styles.note}>
							{ko ? "미리 듣기" : "Preview"} · {preview.durationSec.toFixed(1)}s
							{!take ? (ko ? " · 현재 적용된 음성" : " · Applied voice") : ""}
							{preview.mode === "preset" ? ` · ${toneLabel(preview.tone)}` : ""}
						</p>
						{!candidate && (
							<p role="status" className={styles.note}>
								{ko
									? "현재 선택한 대본·톤과 다른 음성입니다. 새로 생성하고 미리 들어야 적용할 수 있습니다."
									: "This audio differs from the selected script/tone. Generate and listen to a matching take before applying."}
							</p>
						)}
						{/* Generated speech is audio only; the editable script directly above is its transcript. */}
						<audio
							key={preview.jobId}
							ref={audio}
							controls
							src={toFileUrl(preview.audioPath)}
							onPlaying={() => {
								if (candidate?.jobId === preview.jobId) setHeard(preview.jobId);
							}}
							onError={() => {
								setHeard(null);
								setError(
									ko
										? "음성 파일을 재생할 수 없습니다. 다시 생성해 주세요."
										: "Cannot play audio; regenerate this take.",
								);
							}}
						/>
					</>
				)}
				<label>
					{ko ? "시작 위치 · 완성 영상 기준 초" : "Start offset · Output seconds"}
					<input
						type="number"
						min={0}
						max={3600}
						step={0.1}
						value={offset}
						disabled={busy}
						onChange={(e) => setOffset(Number(e.target.value))}
					/>
				</label>
				<label>
					{ko ? "원본 소리" : "Original audio"}
					<select
						value={originalGain}
						disabled={busy}
						onChange={(e) => setOriginalGain(Number(e.target.value))}
					>
						<option value={0.4}>{ko ? "40%로 낮추기" : "Lower to 40%"}</option>
						<option value={1}>{ko ? "유지" : "Keep"}</option>
						<option value={0}>{ko ? "나레이션만" : "Narration only"}</option>
					</select>
				</label>
				<p className={styles.note}>
					{ko
						? "적용하면 프로젝트와 MP4에 포함됩니다. 영상보다 긴 음성은 영상 끝에서 잘립니다. GIF에는 소리가 없습니다. 원본 녹음·이전 생성 파일은 보존됩니다."
						: "Applied narration is saved with the project and included in MP4. Audio beyond the video end is cut. GIF has no audio. Source and earlier takes are preserved."}
				</p>
				<div className={styles.actions}>
					<button
						type="button"
						disabled={
							busy ||
							!candidate ||
							heard !== candidate.jobId ||
							!Number.isFinite(offset) ||
							offset < 0 ||
							offset > 3600
						}
						onClick={() => void apply()}
					>
						{ko ? "영상에 적용" : "Apply to video"}
					</button>
					{attached && (
						<button type="button" disabled={busy} onClick={() => void apply(true)}>
							{ko ? "적용한 나레이션 제거" : "Remove narration"}
						</button>
					)}
				</div>
			</div>
		</ModalShell>
	);
}
