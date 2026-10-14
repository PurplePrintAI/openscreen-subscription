import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import type { NarrationInstallRequest, VoiceInstallStatus } from "@/lib/narration-install";
import { ModalShell } from "./Modals";
import styles from "./StudioSetupDialog.module.css";

const gib = (n: number) => `${(n / 1024 ** 3).toFixed(2)} GiB`;
export function NarrationInstallDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
	const { locale } = useI18n();
	const text = (ko: string, en: string) => (locale.startsWith("ko") ? ko : en);
	const [status, setStatus] = useState<VoiceInstallStatus | null>(null);
	const [mode, setMode] = useState<"download" | "reuse">("download");
	const [trusted, setTrusted] = useState(false);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState(false);
	const epoch = useRef(0);
	const busy =
		pending || (!!status && ["planning", "installing", "verifying"].includes(status.phase));
	async function request(input: NarrationInstallRequest) {
		const current = epoch.current;
		setPending(true);
		setError(false);
		try {
			if (!window.electronAPI?.narrationInstall) throw new Error("No desktop bridge");
			const result = await window.electronAPI.narrationInstall(input);
			if (current === epoch.current) {
				setStatus(result);
				if (input.action === "pick") setTrusted(false);
			}
		} catch {
			if (current === epoch.current) setError(true);
		} finally {
			if (current === epoch.current) setPending(false);
		}
	}
	useEffect(() => {
		if (!open) return;
		const current = ++epoch.current;
		setStatus(null);
		setTrusted(false);
		setError(false);
		setPending(false);
		let polling = false;
		const poll = async () => {
			if (polling) return;
			polling = true;
			try {
				const result = await window.electronAPI?.narrationInstall?.({ action: "status" });
				if (current === epoch.current && result) setStatus(result);
			} catch {
				if (current === epoch.current) setError(true);
			} finally {
				polling = false;
			}
		};
		void poll();
		const timer = setInterval(() => void poll(), 1000);
		return () => {
			epoch.current++;
			clearInterval(timer);
			void window.electronAPI?.narrationInstall?.({ action: "cancel" }).catch(() => undefined);
		};
	}, [open]);
	const reasons: Record<string, string> = {
		"cleanup-failed": text(
			"임시 파일을 정리하지 못했습니다. 선택한 저장 폴더에 이번 작업의 임시 파일이 남아 있을 수 있습니다. 기존 모델과 설정은 유지됩니다.",
			"Temporary cleanup failed. This attempt’s staging files may remain in the selected folder. Existing models/settings are preserved.",
		),
		override: text(
			"환경 변수로 지정된 설정은 이 화면에서 변경할 수 없습니다.",
			"An environment override is read-only here.",
		),
		platform: text(
			"현재 설치 흐름은 Windows x64에서만 지원합니다.",
			"This installer currently supports Windows x64 only.",
		),
		python: text(
			"준비된 Python 3.12 실행 파일을 선택하세요.",
			"Choose a prepared Python 3.12 executable.",
		),
		model: text(
			"기존 CustomVoice 모델 폴더를 선택하세요.",
			"Choose an existing CustomVoice model folder.",
		),
		storage: text("모델을 저장할 로컬 폴더를 선택하세요.", "Choose a local storage folder."),
		space: text("설치에 필요한 여유 공간이 부족합니다.", "Not enough free disk space."),
		diagnostic: text(
			"Python 패키지·CUDA·GPU 진단을 통과하지 못했습니다. Python 3.12, qwen-tts, soundfile, CUDA 지원 PyTorch와 BF16 지원 NVIDIA GPU를 먼저 준비하세요.",
			"Preflight failed. Prepare Python 3.12, qwen-tts, soundfile, CUDA-enabled PyTorch and a BF16-capable NVIDIA GPU.",
		),
		"model-integrity": text(
			"모델 파일이 고정 버전과 일치하지 않습니다. 전체 모델 폴더를 다시 확인하세요.",
			"Model files do not match the pinned revision. Check the complete model folder.",
		),
		"configuration-changed": text(
			"다른 화면에서 설정이 변경되었습니다. 새 설치 계획을 확인하세요.",
			"Configuration changed elsewhere. Create a new plan.",
		),
		configuration: text(
			"기존 설정 파일을 읽을 수 없습니다. 덮어쓰지 않았습니다.",
			"Existing configuration is unreadable and was not overwritten.",
		),
	};
	const plan = status?.plan;
	const usablePlan =
		status?.phase === "review" &&
		plan?.mode === mode &&
		!plan.issues.length &&
		plan.expiresAt > Date.now();
	return (
		<ModalShell
			open={open}
			onClose={() => {
				if (!busy) onClose();
			}}
			title={text("기본 한국어 음성 준비", "Set up Korean preset voice")}
			subtitle={text("진단 → 설치 계획 확인 → 모델 연결", "Diagnose → Review plan → Connect model")}
			wide
		>
			<div className={styles.content}>
				<p>
					{text(
						"기본 음성만 준비합니다. 목소리 복제·전사 모델은 받지 않습니다. Python·패키지 자체는 아직 자동 설치하지 않습니다.",
						"Only preset speech is prepared. No cloning/transcription models are downloaded. Python and its packages are not installed automatically.",
					)}
				</p>
				<div className={styles.actions}>
					{(["download", "reuse"] as const).map((value) => (
						<button
							type="button"
							key={value}
							aria-pressed={mode === value}
							disabled={busy}
							onClick={() => {
								setMode(value);
								setTrusted(false);
							}}
						>
							{value === "download"
								? text("모델 다운로드", "Download model")
								: text("기존 모델 재사용", "Reuse existing model")}
						</button>
					))}
				</div>
				{(["python", mode === "download" ? "storage" : "model"] as const).map((field) => (
					<div className={styles.field} key={field}>
						<div>
							<strong>
								{field === "python"
									? "Python 3.12"
									: field === "storage"
										? text("저장할 폴더", "Storage folder")
										: text("기존 모델 폴더", "Existing model folder")}
							</strong>
							<code>{status?.paths[field] ?? text("선택하지 않음", "Not selected")}</code>
						</div>
						<button
							type="button"
							disabled={busy}
							onClick={() => void request({ action: "pick", field })}
						>
							{text("선택", "Choose")} · {field}
						</button>
					</div>
				))}
				<label className={styles.consent}>
					<input
						type="checkbox"
						checked={trusted}
						disabled={busy}
						onChange={(e) => setTrusted(e.target.checked)}
					/>
					{text(
						"선택한 Python을 신뢰하며 로컬 진단 실행에 동의합니다. 진단에서는 모델 생성·다운로드를 하지 않습니다.",
						"I trust this Python and allow an offline diagnostic. This does not generate audio or download models.",
					)}
				</label>
				<button
					type="button"
					disabled={busy || !trusted}
					onClick={() => void request({ action: "plan", mode, trustPython: true })}
				>
					{text("진단·설치 계획 확인", "Diagnose and review plan")}
				</button>
				{plan && plan.mode === mode && (
					<section className={styles.card} aria-label={text("설치 계획", "Installation plan")}>
						<strong>{plan.model}</strong>
						<code>{plan.revision}</code>
						<p>
							{text("다운로드", "Download")}: {gib(plan.downloadBytes)} ·{" "}
							{text("필요 여유 공간", "Free space required")}: {gib(plan.requiredFreeBytes)} ·{" "}
							{text("현재 여유 공간", "Free now")}: {gib(plan.freeBytes)}
						</p>
						<div className={styles.field}>
							<div>
								<strong>{text("연결할 모델 경로", "Model destination")}</strong>
								<code>{plan.modelPath}</code>
							</div>
						</div>
						{plan.probe && (
							<p>
								Python {plan.probe.python} · {plan.probe.gpu ?? text("GPU 확인 필요", "Check GPU")}{" "}
								{plan.probe.vramBytes ? `(${gib(plan.probe.vramBytes)})` : ""}
							</p>
						)}
						{plan.issues.map((issue) => (
							<p className={styles.warning} key={issue}>
								{reasons[issue] ?? issue}
							</p>
						))}
						<p>
							{text(
								"파일과 GPU 진단은 실제 음성 생성 성공을 보장하지 않습니다. 연결 후 짧은 문장으로 먼저 확인하세요.",
								"File and GPU checks do not guarantee generation. Try a short sentence after connecting.",
							)}
						</p>
						{usablePlan && (
							<button
								className={styles.primary}
								type="button"
								disabled={busy || !trusted}
								onClick={() => void request({ action: "install", planId: plan.id, confirm: true })}
							>
								{mode === "download"
									? text(
											"용량·경로 확인 · 다운로드 및 연결",
											"Confirm size/location · download and connect",
										)
									: text(
											"검증된 모델 연결 · 다운로드 없음",
											"Connect verified model · no download",
										)}
							</button>
						)}
					</section>
				)}
				{busy && (
					<p role="status">
						{status?.phase === "installing"
							? `${text("다운로드 중", "Downloading")} · ${gib(status.receivedBytes ?? 0)}`
							: text("진단·파일 검증 중…", "Diagnosing / verifying files…")}
					</p>
				)}
				{busy && (
					<button
						type="button"
						onClick={() => {
							void window.electronAPI
								?.narrationInstall?.({ action: "cancel" })
								.catch(() => setError(true));
						}}
					>
						{text("취소", "Cancel")}
					</button>
				)}
				{status?.phase === "complete" && (
					<p role="status">
						{text(
							"기본 음성 모델 연결 완료. 나레이션에서 생성·미리 듣기를 시작할 수 있습니다.",
							"Preset model connected. Open Narration to generate and preview.",
						)}
					</p>
				)}
				{status?.phase === "cancelled" && (
					<p role="status">
						{text(
							"취소했습니다. 다시 진단한 뒤 처음부터 재시도할 수 있습니다.",
							"Cancelled. Diagnose again to retry from the beginning.",
						)}
					</p>
				)}
				{(error || status?.error) && (
					<p role="alert" className={styles.warning}>
						{reasons[status?.error ?? ""] ??
							text(
								"작업을 완료하지 못했습니다. 연결·저장 공간을 확인하고 다시 진단하세요. 기존 설정과 모델은 유지됩니다.",
								"Could not complete the operation. Check your connection/storage and diagnose again. Existing settings/models are preserved.",
							)}
					</p>
				)}
				<p>
					{text(
						"다운로드는 Hugging Face의 고정 Qwen 모델 버전만 사용하고 SHA-256으로 검증합니다. 취소 시 이번 임시 파일만 삭제합니다. 이미 검증 완료된 모델은 설정 연결 실패 시에도 남아 재사용할 수 있습니다. 음성·프로젝트 파일은 외부로 보내지 않습니다.",
						"Downloads use a pinned Qwen revision from Hugging Face, checked with SHA-256. Cancellation deletes only this attempt’s staging files; verified models remain reusable if configuration linking fails. Voice/project files are not uploaded.",
					)}
				</p>
				<button type="button" disabled={busy} onClick={onClose}>
					{text("환경 설정으로 돌아가기", "Back to setup")}
				</button>
			</div>
		</ModalShell>
	);
}
