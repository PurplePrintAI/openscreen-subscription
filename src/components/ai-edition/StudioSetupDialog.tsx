import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import {
	NARRATION_FIELDS,
	type SetupField,
	type SetupKind,
	type SetupSection,
	type StudioSetupReply,
	type StudioSetupRequest,
	type StudioSetupSnapshot,
} from "@/lib/studio-setup";
import { ModalShell } from "./Modals";
import styles from "./StudioSetupDialog.module.css";

export function StudioSetupDialog({
	open,
	onClose,
	onOpenProviders,
}: {
	open: boolean;
	onClose: () => void;
	onOpenProviders: () => void;
}) {
	const { locale } = useI18n(),
		ko = locale.startsWith("ko");
	const [snapshot, setSnapshot] = useState<StudioSetupSnapshot | null>(null);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [trusted, setTrusted] = useState<Record<SetupKind, boolean>>({
		narration: false,
		hyperframes: false,
	});
	const epoch = useRef(0);
	const text = (kr: string, en: string) => (ko ? kr : en);
	const labels: Record<SetupField, string> = {
		pythonPath: text("Python 실행 파일", "Python executable"),
		presetModel: text("기본 목소리 모델 · CustomVoice", "Preset voice model · CustomVoice"),
		cloneModel: text("복제 목소리 모델 · Base", "Clone voice model · Base"),
		whisperModel: text(
			"참조 음성 전사 모델 · faster-whisper",
			"Reference transcription model · faster-whisper",
		),
		hyperframesDir: text("HyperFrames 환경 폴더", "HyperFrames runtime folder"),
	};
	function outcome(result: StudioSetupReply["result"]) {
		if (result === "saved")
			return text(
				"저장했습니다. 다음 생성·렌더링부터 사용합니다. 실행 중인 작업과 기존 모델·영상은 바뀌지 않습니다.",
				"Saved for the next generation/render. Running jobs and existing models/videos are unchanged.",
			);
		if (result === "conflict")
			return text(
				"다른 창에서 설정이 바뀌었습니다. 변경 취소 후 다시 선택해 주세요.",
				"Settings changed in another window. Discard your changes and select again.",
			);
		if (result === "readonly")
			return text(
				"개발 환경변수가 설정을 관리하고 있어 여기서는 저장할 수 없습니다.",
				"A development environment override owns this configuration; saving is disabled.",
			);
		if (result === "invalid")
			return text(
				"누락되거나 잘못된 항목을 확인해 주세요. 기존 설정은 유지했습니다.",
				"Check missing or invalid items. The existing configuration is unchanged.",
			);
		if (result === "failed")
			return text(
				"설정을 저장하지 못했습니다. 폴더 접근 권한을 확인한 뒤 다시 시도해 주세요.",
				"Could not save settings. Check folder permissions and retry.",
			);
		return "";
	}
	async function request(input: StudioSetupRequest) {
		const current = epoch.current;
		setBusy(true);
		setMessage("");
		try {
			if (!window.electronAPI?.studioSetup) throw new Error("No desktop bridge");
			const reply = await window.electronAPI.studioSetup(input);
			if (current !== epoch.current) return;
			setSnapshot(reply.snapshot);
			setMessage(outcome(reply.result));
			if (input.action === "pick" || input.action === "reset" || input.action === "save")
				setTrusted({ narration: false, hyperframes: false });
		} catch {
			if (current === epoch.current)
				setMessage(
					text(
						"환경 정보를 확인하지 못했습니다. 다시 확인을 눌러 주세요.",
						"Could not inspect the local environment. Retry the check.",
					),
				);
		} finally {
			if (current === epoch.current) setBusy(false);
		}
	}
	const requestRef = useRef(request);
	requestRef.current = request;
	useEffect(() => {
		if (!open) return;
		epoch.current++;
		setSnapshot(null);
		setTrusted({ narration: false, hyperframes: false });
		void requestRef.current({ action: "reset" });
		return () => {
			epoch.current++;
		};
		// Opening starts a new main-owned draft; locale changes must not discard selections.
	}, [open]);
	function close() {
		if (busy) return;
		epoch.current++;
		void window.electronAPI?.studioSetup?.({ action: "reset" }).catch(() => undefined);
		onClose();
	}
	function section(kind: SetupKind, value: SetupSection) {
		const narration = kind === "narration";
		const fields: readonly SetupField[] = narration ? NARRATION_FIELDS : ["hyperframesDir"];
		const title = narration ? text("한국어 나레이션", "Korean narration") : "HyperFrames";
		const needsChoice = (field: SetupField) =>
			value.issues[field] === "missing" ||
			(field === "hyperframesDir" && !value.configured && !value.changed && !!value.issues[field]);
		return (
			<section className={styles.card} aria-label={title}>
				<div className={styles.heading}>
					<h3>{title}</h3>
					<span>
						{value.valid
							? text("파일 구성 확인됨", "Files checked")
							: text("설정 필요", "Setup needed")}
						{value.changed ? text(" · 저장 전", " · Unsaved") : ""}
					</span>
				</div>
				<p>
					{narration
						? text(
								"기본 목소리와 동의받은 목소리 복제에 사용합니다. Windows·CUDA 환경에서 검증했으며, Python 패키지·GPU의 실제 동작은 생성 시 확인합니다.",
								"For preset speech and consented voice cloning. Tested on Windows/CUDA; Python dependencies and GPU operation are checked during generation.",
							)
						: text(
								"준비된 HyperFrames 0.8.146·GSAP 3.14.2 환경을 선택하세요. Node 22+, 전용 브라우저, FFmpeg/ffprobe와 local-runtime.json이 필요합니다.",
								"Select a prepared HyperFrames 0.8.146 / GSAP 3.14.2 runtime with Node 22+, a dedicated browser, FFmpeg/ffprobe and local-runtime.json.",
							)}
				</p>
				{value.readOnly && <p role="status">{outcome("readonly")}</p>}
				{fields.map((field) => (
					<div className={styles.field} key={field}>
						<div>
							<strong>{labels[field]}</strong>
							<code>
								{!needsChoice(field) && value.paths[field]
									? value.paths[field]
									: text("선택하지 않음", "Not selected")}
							</code>
							{value.issues[field] && (
								<p className={needsChoice(field) ? undefined : styles.warning}>
									{needsChoice(field)
										? text("저장하려면 이 항목을 선택하세요.", "Select this item before saving.")
										: text(
												"필수 파일·모델 종류를 확인하고 다시 선택해 주세요.",
												"Check the required files/model type and select again.",
											)}
								</p>
							)}
						</div>
						<button
							type="button"
							disabled={busy || value.readOnly}
							aria-label={`${labels[field]} ${text("선택", "Choose")}`}
							onClick={() => void request({ action: "pick", field })}
						>
							{text("선택", "Choose")}
						</button>
					</div>
				))}
				{value.issues.configuration && (
					<p className={styles.warning} role="status">
						{text(
							"설정 파일 또는 앱의 필수 도구를 확인할 수 없습니다. 경로를 다시 선택하거나 앱 패키지를 확인해 주세요.",
							"The configuration or required app tools could not be checked. Reselect paths or check the app package.",
						)}
					</p>
				)}
				{narration && (
					<p>
						{text(
							"톤 조절에는 1.7B CustomVoice가 필요합니다. 모델은 speech_tokenizer를 포함한 전체 폴더를 선택하세요.",
							"Tone controls need 1.7B CustomVoice. Select complete model folders including speech_tokenizer.",
						)}
						{value.weightBytes
							? ` ${text("확인된 모델 가중치", "Located model weights")}: ${(value.weightBytes / 1024 ** 3).toFixed(2)} GiB.`
							: ""}
					</p>
				)}
				<label className={styles.consent}>
					<input
						type="checkbox"
						checked={trusted[kind]}
						disabled={busy || value.readOnly}
						onChange={(e) => setTrusted({ ...trusted, [kind]: e.target.checked })}
					/>
					{text(
						"선택한 로컬 프로그램과 모델을 신뢰하며, 생성·렌더링 요청 시 실행하도록 연결합니다.",
						"I trust these local programs/models and authorize their use when I request generation/rendering.",
					)}
				</label>
				<button
					type="button"
					className={styles.primary}
					disabled={busy || value.readOnly || !value.valid || !value.changed || !trusted[kind]}
					onClick={() => void request({ action: "save", kind, trustLocalRuntime: true })}
				>
					{narration
						? text("음성 환경 저장", "Save voice runtime")
						: text("모션 환경 저장", "Save motion runtime")}
				</button>
			</section>
		);
	}
	return (
		<ModalShell
			open={open}
			onClose={close}
			title={text("Studio 환경 설정", "Studio setup")}
			subtitle={text(
				"필요한 환경을 확인하고 기존 로컬 도구를 연결하세요.",
				"Check requirements and connect existing local tools.",
			)}
			wide
		>
			<div className={styles.content} aria-busy={busy}>
				<p>
					{text(
						"영상 가져오기·편집은 이 설정 없이 시작할 수 있습니다. 여기서는 설치·다운로드·로그인·AI 호출을 자동 실행하지 않으며, 모델과 작업 파일을 이동하지 않습니다.",
						"Import/edit video without this setup. Checking settings does not install, download, sign in, call AI or move models/project files.",
					)}
				</p>
				<div className={styles.actions}>
					<button type="button" disabled={busy} onClick={() => void request({ action: "status" })}>
						{text("다시 확인", "Check again")}
					</button>
					<button type="button" disabled={busy} onClick={() => void request({ action: "reset" })}>
						{text("변경 취소", "Discard changes")}
					</button>
				</div>
				{busy && <p role="status">{text("확인 중…", "Checking…")}</p>}
				{message && <p role="status">{message}</p>}
				{snapshot && (
					<>
						<section className={styles.card} aria-label={text("AI 연결", "AI connection")}>
							<h3>{text("AI 연결", "AI connection")}</h3>
							{(["codex", "claude"] as const).map((id) => (
								<div className={styles.cli} key={id}>
									<strong>{id === "codex" ? "Codex CLI" : "Claude Code CLI"}</strong>
									<span>
										{snapshot.cli[id].found
											? text("실행 파일 발견", "Executable found")
											: text("설치 필요 / 경로 확인", "Install / check PATH")}
									</span>
								</div>
							))}
							<p>
								{text(
									"실행 파일 발견은 로그인·버전 호환성·계정 사용 가능을 의미하지 않습니다. 기존 AI 설정에서 연결을 확인하세요. API key 방식에는 CLI가 필요하지 않습니다.",
									"Discovery does not confirm login, version compatibility or account access. Check connection in AI settings. API-key providers do not need a CLI.",
								)}
							</p>
							<button
								type="button"
								disabled={busy || snapshot.narration.changed || snapshot.hyperframes.changed}
								onClick={() => {
									close();
									onOpenProviders();
								}}
							>
								{text("AI 설정 열기", "Open AI settings")}
							</button>
						</section>
						{section("narration", snapshot.narration)}
						{section("hyperframes", snapshot.hyperframes)}
						<details>
							<summary>{text("설치 전 확인할 사항", "Before installing runtimes")}</summary>
							<p>
								{text(
									"음성 모델은 수 GB 이상의 별도 저장 공간이 필요합니다. 기본·복제·전사 모델마다 용량이 다르며, 이 화면의 크기는 이미 선택한 가중치 파일만 계산합니다. D 드라이브 등 원하는 위치에 환경을 준비한 후 연결할 수 있습니다. 자동 설치와 새 PC 지원 검증은 아직 제공하지 않습니다.",
									"Voice models require multiple GB of separate storage. Size varies by model; the size here counts only selected weight files. Prepare tools/models on your preferred drive and connect them. Automatic installation and fresh-machine validation are not yet provided.",
								)}
							</p>
						</details>
					</>
				)}
			</div>
		</ModalShell>
	);
}
