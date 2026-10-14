import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { demoFramingSchema } from "@/lib/demo-framing";
import { type DemoPlan, type DemoRequest, type DemoStatus } from "@/lib/product-demo";
import { ModalShell } from "./Modals";
import styles from "./ProductDemoDialog.module.css";

export function ProductDemoDialog({
	open,
	onClose,
	onOpenDraft,
}: {
	open: boolean;
	onClose: () => void;
	onOpenDraft: (projectId: string) => Promise<void>;
}) {
	const { locale } = useI18n();
	const ko = locale.startsWith("ko");
	const [url, setUrl] = useState("https://purpleprint-ai.com/");
	const [product, setProduct] = useState("PurplePrint");
	const [intent, setIntent] = useState(
		ko
			? "처음 제품을 만드는 사람에게 기능과 가치를 설명해 주세요. 아이디어를 설계로 구체화하고 다음 실행을 결정하는 과정을 보여주세요. 데모·샘플은 예시라고 표시하세요."
			: "Show first-time builders how the product turns an idea into a design and a clear next step. Explain the capabilities and value. Label samples as examples.",
	);
	const [maxSeconds, setMaxSeconds] = useState(150);
	const [status, setStatus] = useState<DemoStatus>({ phase: "idle" });
	const [plan, setPlan] = useState<DemoPlan | null>(null);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const requestEpoch = useRef(0);
	const busy = pending || ["planning", "recording", "encoding"].includes(status.phase);
	const request = useCallback(async (input: DemoRequest) => {
		if (!window.electronAPI?.productDemo)
			throw new Error("Product demo production requires the desktop app.");
		return window.electronAPI.productDemo(input);
	}, []);

	useEffect(() => {
		if (!open) return;
		let closed = false;
		let inFlight = false;
		const poll = async () => {
			if (inFlight) return;
			inFlight = true;
			const epoch = requestEpoch.current;
			try {
				const next = await request({ action: "status" });
				if (!closed && epoch === requestEpoch.current) setStatus(next);
			} catch (err) {
				if (!closed) setError(String(err));
			} finally {
				inFlight = false;
			}
		};
		void poll();
		const timer = setInterval(() => void poll(), 1000);
		return () => {
			closed = true;
			clearInterval(timer);
		};
	}, [open, request]);

	const perform = async (input: DemoRequest) => {
		const epoch = ++requestEpoch.current;
		setPending(true);
		setError(null);
		try {
			const next = await request(input);
			if (requestEpoch.current !== epoch) return;
			requestEpoch.current++;
			setStatus(next);
			if (next.phase === "review" && next.plan) setPlan(next.plan);
		} catch (err) {
			setError(String(err));
		} finally {
			setPending(false);
		}
	};
	const close = () => {
		requestEpoch.current++;
		// Closing stops the producer, including its dedicated browser. Never leave
		// an invisible recorder running after the user's dialog has gone away.
		void request({ action: "cancel" }).catch((err) =>
			console.warn("Could not cancel production", err),
		);
		onClose();
	};
	const duration = plan?.scenes.reduce((sum, scene) => sum + scene.durationSec, 0) ?? 0;
	const invalidFraming = plan?.scenes.some(
		(scene) =>
			scene.framing &&
			(!demoFramingSchema.safeParse(scene.framing).success ||
				scene.framing.endSec > scene.durationSec - 1.6),
	);
	const phaseLabel = ko
		? {
				idle: "입력",
				planning: "제품 확인·촬영안 작성 중",
				review: "촬영안 검토",
				recording: "브라우저 촬영 중",
				encoding: "장면 인코딩 중",
				ready: "편집 초안 저장 완료",
				cancelled: "중단됨",
				error: "완료하지 못함",
			}
		: {
				idle: "Brief",
				planning: "Inspecting and planning",
				review: "Review shot plan",
				recording: "Capturing browser",
				encoding: "Encoding shot",
				ready: "Editable draft saved",
				cancelled: "Stopped",
				error: "Not completed",
			};

	return (
		<ModalShell
			open={open}
			onClose={close}
			title={ko ? "제품 소개 영상 만들기 · 실험 기능" : "Create a product demo · Preview"}
			wide
		>
			<div className={styles.content}>
				<p className={styles.note}>
					{ko
						? "공개 웹페이지용 무음 초안입니다. 전용 브라우저에서 페이지 스크롤·탭 전환을 촬영합니다. 로그인·폼 입력·데스크톱 앱·내레이션은 아직 지원하지 않습니다. 캡처 최대 12fps, 영상 파일 30fps입니다."
						: "A silent draft for public web pages. Records scrolling and tab changes in a dedicated browser. No login, forms, desktop apps or narration yet. Capture up to 12 fps; video files at 30 fps."}
				</p>
				<label>
					{ko ? "제품 이름" : "Product"}
					<input
						value={product}
						onChange={(e) => setProduct(e.target.value)}
						disabled={busy || status.phase === "review"}
						maxLength={100}
					/>
				</label>
				<label>
					URL
					<input
						value={url}
						onChange={(e) => setUrl(e.target.value)}
						disabled={busy || status.phase === "review"}
						maxLength={2048}
					/>
				</label>
				<label>
					{ko ? "대상·기획 의도·보여줄 가치" : "Audience, intent and value"}
					<textarea
						value={intent}
						onChange={(e) => setIntent(e.target.value)}
						disabled={busy || status.phase === "review"}
						maxLength={4000}
						rows={3}
					/>
				</label>
				<label>
					{ko ? "최대 길이 (초, 5분 미만)" : "Maximum duration (seconds, under 5 minutes)"}
					<input
						type="number"
						min={15}
						max={299}
						value={maxSeconds}
						onChange={(e) => setMaxSeconds(Number(e.target.value))}
						disabled={busy || status.phase === "review"}
					/>
				</label>
				<p className={styles.note}>
					{ko
						? "촬영안 작성 시 입력 내용과 페이지의 텍스트를 현재 선택한 Codex/Claude 구독 모델에 보냅니다. 구독 사용량이 발생합니다. 촬영은 아래 계획을 승인한 뒤 시작합니다."
						: "Planning sends this brief and the page text to your selected Codex/Claude subscription model and uses your allowance. Recording starts only after you approve the plan below."}
				</p>
				<div className={styles.actions}>
					<button
						type="button"
						disabled={
							busy ||
							status.phase === "review" ||
							!product.trim() ||
							intent.trim().length < 10 ||
							maxSeconds < 15 ||
							maxSeconds > 299
						}
						onClick={() =>
							void perform({
								action: "plan",
								brief: { url, product, intent, maxSeconds, language: ko ? "ko" : "en" },
							})
						}
					>
						{ko ? "제품 열고 AI 촬영안 작성" : "Open product and plan with AI"}
					</button>
				</div>
				<div role="status" aria-live="polite">
					{phaseLabel[status.phase]}
					{status.sceneIndex !== undefined && busy
						? ` · ${status.sceneIndex + 1}/${status.sceneCount}`
						: ""}
				</div>
				{(error || status.error) && (
					<p role="alert" className={styles.error}>
						{error || status.error}
					</p>
				)}
				{plan && (
					<section aria-label={ko ? "촬영안" : "Shot plan"}>
						<h3>
							{plan.title} · {duration}s
						</h3>
						<p>{plan.summary}</p>
						<ol className={styles.scenes}>
							{plan.scenes.map((scene, index) => (
								<li key={`${index}-${scene.targetId}`}>
									<strong>
										{scene.title} · {scene.durationSec}s
									</strong>
									<label>
										{ko ? "자막" : "Caption"}
										<textarea
											rows={2}
											maxLength={110}
											value={scene.caption}
											disabled={busy || status.phase !== "review"}
											onChange={(e) =>
												setPlan({
													...plan,
													scenes: plan.scenes.map((s, i) =>
														i === index ? { ...s, caption: e.target.value } : s,
													),
												})
											}
										/>
									</label>
									<label className={styles.check}>
										<input
											type="checkbox"
											checked={!!scene.framing}
											disabled={
												busy ||
												status.phase !== "review" ||
												scene.targetId === 0 ||
												scene.durationSec < 6
											}
											onChange={(e) =>
												setPlan({
													...plan,
													scenes: plan.scenes.map((s, i) =>
														i === index
															? {
																	...s,
																	framing: e.target.checked
																		? { startSec: 3, endSec: scene.durationSec - 2, scale: 1.25 }
																		: undefined,
																}
															: s,
													),
												})
											}
										/>
										{ko ? "대상 영역 줌" : "Focus on target"}
									</label>
									{scene.framing && (
										<div className={styles.framing}>
											{(["startSec", "endSec", "scale"] as const).map((key) => (
												<label key={key}>
													{
														{
															startSec: ko ? "줌 시작 (초)" : "Zoom start (s)",
															endSec: ko ? "줌 복귀 시작 (초)" : "Return starts (s)",
															scale: ko ? "배율" : "Scale",
														}[key]
													}
													<input
														type="number"
														step={key === "scale" ? 0.05 : 0.1}
														min={
															key === "scale"
																? 1.05
																: key === "startSec"
																	? 3
																	: scene.framing!.startSec + 1
														}
														max={
															key === "scale"
																? 1.5
																: scene.durationSec - (key === "startSec" ? 2.6 : 1.6)
														}
														value={scene.framing![key]}
														disabled={busy || status.phase !== "review"}
														onChange={(e) =>
															setPlan({
																...plan,
																scenes: plan.scenes.map((s, i) =>
																	i === index && s.framing
																		? {
																				...s,
																				framing: { ...s.framing, [key]: Number(e.target.value) },
																			}
																		: s,
																),
															})
														}
													/>
												</label>
											))}
										</div>
									)}
									{scene.framing && (
										<p className={styles.note}>
											{ko
												? "실제 대상 위치가 안정된 경우에만 적용합니다. 대상이 잘리지 않도록 배율이 낮아질 수 있습니다. 녹화 해상도 이상의 선명도를 만들지는 않습니다. 초안의 줌 트랙에서 위치·시간·배율을 수정할 수 있습니다."
												: "Applied only to an observed stable target. Scale may be reduced to keep it visible; zoom cannot add source detail. Edit focus, timing and scale in the draft's zoom track."}
										</p>
									)}
								</li>
							))}
						</ol>
					</section>
				)}
				<div className={styles.actions}>
					{status.phase === "review" && plan && status.jobId && (
						<button
							type="button"
							disabled={
								busy || invalidFraming || plan.scenes.some((scene) => !scene.caption.trim())
							}
							onClick={() => void perform({ action: "record", jobId: status.jobId!, plan })}
						>
							{ko ? "이 촬영안으로 녹화·초안 만들기" : "Approve plan and record draft"}
						</button>
					)}
					{status.phase === "review" && (
						<button
							type="button"
							disabled={busy}
							onClick={() => {
								void request({ action: "cancel" })
									.then((next) => {
										setStatus(next);
										setPlan(null);
									})
									.catch((err) => setError(String(err)));
							}}
						>
							{ko ? "촬영안 취소·기획 수정" : "Discard plan and revise brief"}
						</button>
					)}
					{busy && (
						<button
							type="button"
							onClick={() =>
								void request({ action: "cancel" })
									.then(setStatus)
									.catch((err) => setError(String(err)))
							}
						>
							{ko ? "제작 중단" : "Stop production"}
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
							{ko ? "편집 초안 열기" : "Open editable draft"}
						</button>
					)}
				</div>
				{invalidFraming && (
					<p role="alert" className={styles.error}>
						{ko
							? "줌은 3초 이후 시작하고, 1초 이상 유지하며 장면 끝 1.6초 전까지 복귀를 시작해야 합니다."
							: "Start at 3s or later, hold at least 1s, and leave 1.6s to return."}
					</p>
				)}
				{status.warnings?.map((warning) => (
					<p key={warning} role="status" className={styles.note}>
						{warning}
					</p>
				))}
				{status.folder && <p className={styles.path}>{status.folder}</p>}
			</div>
		</ModalShell>
	);
}
