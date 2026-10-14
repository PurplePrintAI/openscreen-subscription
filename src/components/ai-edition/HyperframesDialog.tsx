import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import {
	HYPERFRAMES_VERSION,
	type HyperframesRequest,
	type HyperframesStatus,
	motionSceneSchema,
} from "@/lib/hyperframes";
import { ModalShell } from "./Modals";
import styles from "./ProductDemoDialog.module.css";

export function HyperframesDialog({
	open,
	onClose,
	onOpenDraft,
	onOpenSetup,
}: {
	open: boolean;
	onClose: () => void;
	onOpenDraft: (id: string) => Promise<void>;
	onOpenSetup?: () => void;
}) {
	const { locale } = useI18n();
	const ko = locale.startsWith("ko");
	const document = useProjectStore((s) => s.document);
	const [title, setTitle] = useState(ko ? "로컬 렌더링 연결 확인" : "Local rendering check");
	const [subtitle, setSubtitle] = useState(
		ko
			? "데모·투어 준비 전, 설치와 Studio 편집 연결만 확인하는 테스트 장면입니다."
			: "A diagnostic scene to verify rendering and Studio import before the product demo is ready.",
	);
	const [durationSec, setDuration] = useState(18);
	const [assetId, setAssetId] = useState("");
	const [startSec, setStart] = useState(0);
	const [status, setStatus] = useState<HyperframesStatus>({
		phase: "idle",
		runtime: { available: false, version: HYPERFRAMES_VERSION, runtimeDir: "" },
	});
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const epoch = useRef(0);
	const previousProject = useRef(document?.project.id);
	const busy = pending || ["preparing", "linting", "rendering", "verifying"].includes(status.phase);
	const request = useCallback(async (input: HyperframesRequest) => {
		if (!window.electronAPI?.hyperframes) throw new Error("HyperFrames requires the desktop app.");
		return window.electronAPI.hyperframes(input);
	}, []);
	useEffect(() => {
		if (previousProject.current !== document?.project.id) {
			previousProject.current = document?.project.id;
			setAssetId("");
			setStart(0);
		}
	}, [document?.project.id]);
	useEffect(() => {
		if (!open) return;
		let closed = false,
			inFlight = false;
		const poll = async () => {
			if (inFlight) return;
			inFlight = true;
			const current = epoch.current;
			try {
				const next = await request({ action: "status" });
				if (!closed && current === epoch.current) setStatus(next);
			} catch (err) {
				if (!closed) setError(String(err));
			} finally {
				inFlight = false;
			}
		};
		void poll();
		const timer = setInterval(() => void poll(), 1200);
		return () => {
			closed = true;
			clearInterval(timer);
		};
	}, [open, request]);
	const perform = async (input: HyperframesRequest) => {
		const current = ++epoch.current;
		setPending(true);
		setError("");
		if (input.action === "render") {
			setStatus((previous) => ({ phase: "preparing", runtime: previous.runtime }));
		}
		try {
			const next = await request(input);
			if (current === epoch.current) {
				epoch.current++;
				setStatus(next);
			}
		} catch (err) {
			if (current === epoch.current) setError(String(err));
		} finally {
			setPending(false);
		}
	};
	const close = () => {
		epoch.current++;
		void request({ action: "cancel" }).catch((err) =>
			console.warn("Could not stop local render", err),
		);
		onClose();
	};
	const scene = motionSceneSchema.safeParse({
		title,
		subtitle,
		durationSec,
		source: assetId ? { projectId: document?.project.id, assetId, startSec } : undefined,
	});
	const phaseLabel: Record<HyperframesStatus["phase"], string> = ko
		? {
				idle: "대기",
				preparing: "로컬 소스 준비 중",
				linting: "장면 검사 중",
				rendering: "프레임 렌더링 중",
				verifying: "영상 검증 중",
				ready: "새 프로젝트 저장 완료",
				cancelled: "중단됨",
				error: "완료하지 못함",
			}
		: {
				idle: "Idle",
				preparing: "Preparing local assets",
				linting: "Checking composition",
				rendering: "Rendering frames",
				verifying: "Verifying video",
				ready: "New project saved",
				cancelled: "Stopped",
				error: "Not completed",
			};
	if (!open) return null;
	return (
		<ModalShell
			open={open}
			title={ko ? "HyperFrames · 로컬 모션" : "HyperFrames · Local motion"}
			onClose={close}
		>
			<div className={styles.content}>
				<p className={styles.note}>
					{ko
						? "데모·투어가 준비되면 실제 제품 장면 15~20초로 품질을 검증합니다. 지금 기본값은 제품 데모가 아닌 연결 진단용입니다. AI·음성·클라우드 호출 없이 로컬에서 렌더링합니다."
						: "Once the demo/tour is ready, validate 15–20 seconds of real product footage. Defaults are a connection diagnostic, not a product demo. Rendering is local, with no AI, voice or cloud calls."}
				</p>
				<p>
					HyperFrames {status.runtime.version} ·{" "}
					{status.runtime.available
						? ko
							? "로컬 구성 확인됨"
							: "Locally configured"
						: ko
							? "런타임 설정 필요"
							: "Runtime setup required"}
				</p>
				{!status.runtime.available && (
					<>
						<p className={styles.note}>
							{ko
								? "로컬 모션 환경을 찾지 못했거나 필수 파일이 맞지 않습니다. Studio 환경 설정에서 준비된 폴더를 선택하고 다시 확인하세요. 자동 다운로드하지 않습니다."
								: "The local motion runtime is missing or incomplete. Choose a prepared folder in Studio setup and check again. Nothing is downloaded automatically."}
						</p>
						{onOpenSetup && (
							<div className={styles.actions}>
								<button type="button" disabled={busy} onClick={onOpenSetup}>
									{ko ? "Studio 환경 설정 열기" : "Open Studio setup"}
								</button>
							</div>
						)}
						{status.runtime.error && (
							<details>
								<summary>{ko ? "기술 정보" : "Technical details"}</summary>
								<p className={styles.path}>{status.runtime.error}</p>
							</details>
						)}
					</>
				)}
				<label>
					{ko ? "영상 소스" : "Video source"}
					<select
						aria-label={ko ? "영상 소스" : "Video source"}
						value={assetId}
						disabled={busy}
						onChange={(e) => setAssetId(e.target.value)}
					>
						<option value="">
							{ko ? "진단용 그래픽 (제품 화면 아님)" : "Diagnostic graphics (not product footage)"}
						</option>
						{document?.assets
							.filter((asset) => asset.kind === "video")
							.map((asset) => (
								<option key={asset.id} value={asset.id}>
									{asset.label || asset.id}
								</option>
							))}
					</select>
				</label>
				{assetId && (
					<label>
						{ko ? "원본 시작 시간 (초)" : "Source start (seconds)"}
						<input
							type="number"
							min={0}
							value={startSec}
							disabled={busy}
							onChange={(e) => setStart(Number(e.target.value))}
						/>
					</label>
				)}
				<label>
					{ko ? "제목" : "Title"}
					<input
						maxLength={90}
						value={title}
						disabled={busy}
						onChange={(e) => setTitle(e.target.value)}
					/>
				</label>
				<label>
					{ko ? "설명" : "Description"}
					<textarea
						rows={2}
						maxLength={160}
						value={subtitle}
						disabled={busy}
						onChange={(e) => setSubtitle(e.target.value)}
					/>
				</label>
				<label>
					{ko ? "길이 (초)" : "Duration (seconds)"}
					<input
						type="number"
						min={6}
						max={20}
						value={durationSec}
						disabled={busy}
						onChange={(e) => setDuration(Number(e.target.value))}
					/>
				</label>
				<p className={styles.note}>
					{ko
						? "1080p · 30fps · 무음. 원본은 보존하며 새 프로젝트를 만듭니다. 그래픽은 MP4에 합성되며 HTML·설정·소스가 함께 남습니다. 문구나 구성을 바꾸려면 다시 렌더링하세요. 저해상도 원본의 디테일을 복원하지는 않습니다."
						: "1080p · 30 fps · silent. Originals are preserved; a new project is created. Graphics are flattened in the MP4; HTML, settings and assets are retained. Re-render to revise graphics. This does not recover detail in low-resolution footage."}
				</p>
				<div role="status" aria-live="polite">
					{phaseLabel[status.phase]}
				</div>
				{(error || status.error) && (
					<p role="alert" className={styles.error}>
						{error || status.error}
					</p>
				)}
				<div className={styles.actions}>
					<button
						type="button"
						disabled={busy || !status.runtime.available || !scene.success}
						onClick={() => {
							if (scene.success) void perform({ action: "render", scene: scene.data });
						}}
					>
						{ko ? "로컬 렌더링 → 새 프로젝트" : "Render locally → new project"}
					</button>
					{busy && (
						<button
							type="button"
							onClick={() =>
								void request({ action: "cancel" })
									.then(setStatus)
									.catch((err) => setError(String(err)))
							}
						>
							{ko ? "중단" : "Stop"}
						</button>
					)}
					{status.phase === "ready" && status.projectId && (
						<button
							type="button"
							onClick={() =>
								void onOpenDraft(status.projectId!)
									.then(onClose)
									.catch((err) => setError(String(err)))
							}
						>
							{ko ? "Studio에서 열기" : "Open in Studio"}
						</button>
					)}
					{status.jobId && !busy && (
						<button
							type="button"
							onClick={() => void perform({ action: "reveal", jobId: status.jobId! })}
						>
							{ko ? "HTML·설정·영상 폴더" : "HTML, settings and video folder"}
						</button>
					)}
				</div>
				<p className={styles.path}>{status.folder || status.runtime.runtimeDir}</p>
			</div>
		</ModalShell>
	);
}
