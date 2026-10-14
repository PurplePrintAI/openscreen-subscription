import { useEffect, useRef, useState } from "react";
import { toFileUrl } from "@/components/video-editor/projectPersistence";
import { useI18n } from "@/contexts/I18nContext";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import { getNarration } from "@/lib/narration";
import {
	assembleScenePlan,
	initialScenePlan,
	type PlannedScene,
	type ScenePlan,
	scenePlanSchema,
	scheduleScenes,
	validateSceneAssets,
	withScenePlan,
} from "@/lib/scene-plan";
import {
	type AcceptedSceneRevision,
	emptySceneChecks,
	sceneReviewReport,
	storedSceneChecks,
	withSceneChecks,
} from "@/lib/scene-review";
import { nativeBridgeClient } from "@/native/client";
import { ModalShell } from "./Modals";
import { SceneAnimaticPreview } from "./SceneAnimaticPreview";
import styles from "./ScenePlanDialog.module.css";
import { ScenePlanFields } from "./ScenePlanFields";
import { ScenePlannerPanel } from "./ScenePlannerPanel";
import { SceneReviewPanel } from "./SceneReviewPanel";

const PLAN_TABS = ["plan", "request", "preview", "animatic", "review"] as const;

function downloadJson(name: string, value: unknown) {
	const url = URL.createObjectURL(
		new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
	);
	const link = document.createElement("a");
	link.href = url;
	link.download = name;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function ScenePlanDialog({
	open,
	onClose,
	onOpenDraft,
}: {
	open: boolean;
	onClose: () => void;
	onOpenDraft: (id: string) => Promise<void>;
}) {
	const { locale } = useI18n();
	const ko = locale.startsWith("ko");
	const doc = useProjectStore((s) => s.document);
	const projectId = doc?.project.id;
	const [plan, setPlan] = useState<ScenePlan | null>(null);
	const [tab, setTab] = useState<(typeof PLAN_TABS)[number]>("plan");
	const [mobile, setMobile] = useState(false);
	const [busy, setBusy] = useState(false);
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [checks, setChecks] = useState(emptySceneChecks);
	const [proposalPending, setProposalPending] = useState(false);
	const [accepted, setAccepted] = useState<AcceptedSceneRevision | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);
	useEffect(() => {
		const current = useProjectStore.getState().document;
		if (open && projectId && current?.project.id === projectId) {
			useProjectStore.getState().setPlaying(false);
			setPlan(initialScenePlan(current));
			setChecks(storedSceneChecks(current));
			setProposalPending(false);
			setAccepted(null);
			setMessage("");
			setError("");
		}
		// Ordinary editor saves must not replace edits still being reviewed in this dialog.
	}, [open, projectId]);
	if (!open) return null;
	const parsed = scenePlanSchema.safeParse(plan);
	let invalid = parsed.success
		? ""
		: ko
			? "장면과 사용 구간을 확인해 주세요."
			: "Check the scenes and source ranges.";
	if (parsed.success && doc) {
		try {
			validateSceneAssets(parsed.data, doc);
		} catch (err) {
			invalid = String(err);
		}
	}
	const schedule = parsed.success ? scheduleScenes(parsed.data) : [];
	const duration = schedule.at(-1)?.endSec ?? 0;
	const patch = (id: string, update: Partial<PlannedScene>) => {
		setMessage("");
		setPlan(
			(p) => p && { ...p, scenes: p.scenes.map((s) => (s.id === id ? { ...s, ...update } : s)) },
		);
	};
	const close = () => {
		if (proposalPending) {
			setError(
				ko
					? "진행 중인 요청을 취소하거나, 제안을 채택·닫기한 뒤 창을 닫아 주세요."
					: "Cancel the active request or accept/discard the proposal before closing.",
			);
			return;
		}
		if (!busy) onClose();
	};
	const savePlan = async () => {
		if (!parsed.success || !doc || invalid || proposalPending) return;
		setBusy(true);
		setError("");
		setMessage("");
		try {
			const current = useProjectStore.getState();
			if (current.projectId !== doc.project.id || !current.document)
				throw new Error("Project changed.");
			const saved = await current.saveDocument(
				withSceneChecks(withScenePlan(current.document, parsed.data), checks),
				{
					history: true,
				},
			);
			if (saved)
				setMessage(
					ko ? "기획 저장됨 · 다시 열어 이어갈 수 있습니다." : "Plan saved. Reopen to continue.",
				);
			else throw new Error(ko ? "기획을 저장하지 못했습니다." : "Plan was not saved.");
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	};
	const assemble = async () => {
		if (!parsed.success || !doc || invalid || proposalPending) return;
		setBusy(true);
		setError("");
		setMessage("");
		try {
			const current = useProjectStore.getState();
			if (current.projectId !== doc.project.id || !current.document)
				throw new Error("Project changed.");
			const draft = assembleScenePlan(parsed.data, current.document, `proj_${crypto.randomUUID()}`);
			const result = await nativeBridgeClient.aiEdition.save(draft);
			if (!result.success) throw new Error(result.error ?? "Could not save the draft.");
			if (useProjectStore.getState().projectId !== doc.project.id)
				throw new Error("Project changed. Draft saved separately.");
			await onOpenDraft(draft.project.id);
			onClose();
		} catch (err) {
			setError(String(err));
		} finally {
			setBusy(false);
		}
	};
	const importPlan = async (file?: File) => {
		if (!file || !doc) return;
		setError("");
		try {
			if (file.size > 128 * 1024) throw new Error("Plan must be smaller than 128 KiB.");
			const next = scenePlanSchema.parse(JSON.parse(await file.text()));
			if (useProjectStore.getState().projectId !== doc.project.id)
				throw new Error("Project changed.");
			validateSceneAssets(next, doc);
			setPlan(next);
			setChecks(emptySceneChecks());
			setAccepted(null);
			setMessage(
				ko
					? "가져온 기획을 검토한 뒤 저장하거나 조립해 주세요."
					: "Review the imported plan before saving or assembling.",
			);
		} catch (err) {
			setError(String(err));
		}
	};
	return (
		<ModalShell open={open} onClose={close} title={ko ? "영상 기획" : "Film plan"} wide>
			<div className={styles.root}>
				<p className={styles.note}>
					{ko
						? "등록된 영상으로 기획하고, 원본을 유지한 채 새 편집 초안을 만듭니다. AI 호출은 ‘AI 기획’에서 전송 내용을 확인하고 요청할 때만 실행합니다."
						: "Plan with registered media and assemble a separate draft. AI runs only after reviewing and submitting a request in AI planning."}
				</p>
				{!doc ? (
					<p>
						{ko ? "먼저 프로젝트에 영상을 가져와 주세요." : "Import media into a project first."}
					</p>
				) : (
					plan && (
						<>
							<div className={styles.toolbar}>
								<div
									role="tablist"
									aria-label={ko ? "기획 보기" : "Plan views"}
									className={styles.tabs}
								>
									{PLAN_TABS.map((id, index) => (
										<button
											key={id}
											type="button"
											role="tab"
											id={`scene-tab-${id}`}
											aria-controls={`scene-panel-${id}`}
											aria-selected={tab === id}
											disabled={proposalPending && tab !== id}
											tabIndex={tab === id ? 0 : -1}
											onClick={() => setTab(id)}
											onKeyDown={(e) => {
												if (proposalPending) return;
												if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
													e.preventDefault();
													const next =
														PLAN_TABS[
															e.key === "Home"
																? 0
																: e.key === "End"
																	? PLAN_TABS.length - 1
																	: (index + (e.key === "ArrowRight" ? 1 : PLAN_TABS.length - 1)) %
																		PLAN_TABS.length
														];
													setTab(next);
													document.getElementById(`scene-tab-${next}`)?.focus();
												}
											}}
										>
											{id === "request"
												? ko
													? "AI 기획"
													: "AI planning"
												: id === "review"
													? ko
														? "수정·검수"
														: "Revise & check"
													: id === "plan"
														? ko
															? "장면 구성"
															: "Scenes"
														: id === "animatic"
															? ko
																? "애니매틱"
																: "Animatic"
															: ko
																? "프리뷰 · 장면 시트"
																: "Preview · Scene sheet"}
										</button>
									))}
								</div>
								<strong data-testid="plan-duration">
									{plan.scenes.length}
									{ko ? "개 장면" : " scenes"} · {duration.toFixed(2)}s ·{" "}
									{Math.round(duration * 30)} frames
								</strong>
							</div>
							<fieldset disabled={busy} className={styles.fields}>
								<label>
									{ko ? "영상 제목" : "Film title"}
									<input
										value={plan.title}
										disabled={proposalPending}
										maxLength={100}
										onChange={(e) => setPlan({ ...plan, title: e.target.value })}
									/>
								</label>
								<div className={styles.actions}>
									<button
										type="button"
										disabled={proposalPending}
										onClick={() => fileInput.current?.click()}
									>
										{ko ? "기획 JSON 가져오기" : "Import plan JSON"}
									</button>
									<input
										ref={fileInput}
										type="file"
										accept=".json,application/json"
										hidden
										onChange={(e) => {
											void importPlan(e.target.files?.[0]);
											e.target.value = "";
										}}
									/>
									<button
										type="button"
										disabled={!!invalid}
										onClick={() =>
											downloadJson("scene-plan.json", parsed.success ? parsed.data : plan)
										}
									>
										{ko ? "기획 JSON 저장" : "Download plan"}
									</button>
									<button
										type="button"
										disabled={!!invalid}
										onClick={() =>
											parsed.success &&
											downloadJson(
												"scene-review-plan.json",
												sceneReviewReport(parsed.data, doc, checks),
											)
										}
									>
										{ko ? "검수 시간표 저장" : "Download review schedule"}
									</button>
								</div>
								{tab === "request" ? (
									<section
										role="tabpanel"
										id="scene-panel-request"
										aria-labelledby="scene-tab-request"
									>
										<ScenePlannerPanel
											key={doc.project.id}
											source={doc}
											plan={parsed.success ? parsed.data : null}
											ko={ko}
											onPendingChange={setProposalPending}
											onAccept={(next) => {
												setPlan(next);
												setAccepted(null);
												setMessage("");
												setError("");
												setTab("preview");
											}}
										/>
									</section>
								) : tab === "plan" ? (
									<section
										role="tabpanel"
										id="scene-panel-plan"
										aria-labelledby="scene-tab-plan"
										className={styles.scenes}
									>
										{plan.scenes.map((scene, i) => (
											<article key={scene.id} className={styles.scene}>
												<header>
													<strong>
														{i + 1}. {scene.title}
													</strong>
													<span>
														{schedule[i]
															? `${schedule[i].startSec.toFixed(2)}–${schedule[i].endSec.toFixed(2)}s`
															: "—"}
													</span>
												</header>
												<ScenePlanFields
													scene={scene}
													assets={doc.assets}
													i={i}
													ko={ko}
													onChange={(update) => patch(scene.id, update)}
												/>
												<div className={styles.actions}>
													<button
														type="button"
														disabled={i === 0}
														onClick={() => {
															const next = [...plan.scenes];
															[next[i - 1], next[i]] = [next[i], next[i - 1]];
															setPlan({ ...plan, scenes: next });
														}}
													>
														{ko ? "앞으로" : "Move earlier"}
													</button>
													<button
														type="button"
														disabled={plan.scenes.length === 1}
														onClick={() =>
															setPlan({
																...plan,
																scenes: plan.scenes.filter((s) => s.id !== scene.id),
															})
														}
													>
														{ko ? "장면 제거" : "Remove scene"}
													</button>
												</div>
											</article>
										))}
										<button
											type="button"
											disabled={plan.scenes.length >= 16 || !doc.assets.length}
											onClick={() => {
												const a = doc.assets[0];
												setPlan({
													...plan,
													scenes: [
														...plan.scenes,
														{
															id: `scene_${crypto.randomUUID()}`,
															title: `Scene ${plan.scenes.length + 1}`,
															assetId: a.id,
															inSec: 0,
															outSec: Math.min(6, Math.floor((a.durationSec ?? 0) * 30) / 30),
															caption: "",
														},
													],
												});
											}}
										>
											{ko ? "장면 추가" : "Add scene"}
										</button>
									</section>
								) : tab === "review" ? (
									<section
										role="tabpanel"
										id="scene-panel-review"
										aria-labelledby="scene-tab-review"
									>
										{parsed.success && !invalid ? (
											<SceneReviewPanel
												key={doc.project.id}
												plan={parsed.data}
												source={doc}
												checks={checks}
												onChecks={setChecks}
												onPlan={setPlan}
												onPendingChange={setProposalPending}
												accepted={accepted}
												setAccepted={setAccepted}
												ko={ko}
											/>
										) : (
											<p>{invalid}</p>
										)}
									</section>
								) : tab === "animatic" ? (
									<section
										role="tabpanel"
										id="scene-panel-animatic"
										aria-labelledby="scene-tab-animatic"
									>
										{parsed.success && !invalid ? (
											<SceneAnimaticPreview plan={parsed.data} source={doc} ko={ko} />
										) : (
											<p>{invalid}</p>
										)}
									</section>
								) : (
									<section
										role="tabpanel"
										id="scene-panel-preview"
										aria-labelledby="scene-tab-preview"
									>
										<p className={styles.note}>
											{ko
												? "원본 프레임과 편집 계획을 보는 장면 시트입니다. 줌·자막의 최종 합성 결과는 조립 후 편집기에서 확인하세요."
												: "Source frames and editing intent, not final composited output. Inspect the assembled draft for final effects."}
										</p>
										<label className={styles.check}>
											<input
												type="checkbox"
												checked={mobile}
												onChange={(e) => setMobile(e.target.checked)}
											/>
											{ko ? "모바일 폭 390px로 보기" : "390px mobile width"}
										</label>
										<div className={`${styles.sheet} ${mobile ? styles.mobile : ""}`}>
											{schedule.map((scene, i) => {
												const asset = doc.assets.find((a) => a.id === scene.assetId);
												return (
													<article
														key={`${scene.id}-${scene.inSec}-${scene.outSec}`}
														className={styles.card}
													>
														<div className={styles.frame}>
															{asset ? (
																<video
																	aria-label={`${scene.title} ${ko ? "원본 미리보기" : "source preview"}`}
																	src={toFileUrl(asset.originalPath)}
																	muted
																	preload="auto"
																	playsInline
																	controls
																	onLoadedMetadata={(e) => {
																		e.currentTarget.currentTime =
																			scene.inSec + scene.durationSec / 2;
																	}}
																	onTimeUpdate={(e) => {
																		if (
																			!e.currentTarget.paused &&
																			e.currentTarget.currentTime >= scene.outSec
																		) {
																			e.currentTarget.pause();
																			e.currentTarget.currentTime = scene.inSec;
																		}
																	}}
																	onPlay={(e) => {
																		if (
																			e.currentTarget.currentTime < scene.inSec ||
																			e.currentTarget.currentTime >= scene.outSec
																		)
																			e.currentTarget.currentTime = scene.inSec;
																	}}
																/>
															) : (
																<span>{ko ? "소스 없음" : "Missing source"}</span>
															)}
														</div>
														<div className={styles.cardBody}>
															<header>
																<strong>
																	{i + 1}. {scene.title}
																</strong>
																<span>
																	{scene.startSec.toFixed(2)}–{scene.endSec.toFixed(2)}s
																</span>
															</header>
															<p>{scene.caption || (ko ? "표시 문장 없음" : "No text overlay")}</p>
															<small>
																{ko ? "원본" : "Source"} {scene.inSec.toFixed(2)}–
																{scene.outSec.toFixed(2)}s ·{" "}
																{scene.zoom
																	? `${scene.zoom.scale}× (${scene.zoom.cx}, ${scene.zoom.cy})`
																	: ko
																		? "전체 화면"
																		: "Full view"}
															</small>
														</div>
													</article>
												);
											})}
										</div>
									</section>
								)}
								{getNarration(doc) && (
									<label className={styles.check}>
										<input
											type="checkbox"
											checked={plan.keepNarration}
											disabled={proposalPending}
											onChange={(e) => setPlan({ ...plan, keepNarration: e.target.checked })}
										/>
										{ko ? "저장된 나레이션 재사용" : "Reuse saved narration"}
									</label>
								)}
								{plan.keepNarration && (
									<p className={styles.warning}>
										{ko
											? "음성은 늘리거나 빠르게 만들지 않습니다. 장면 길이·순서 변경 후 음성과 강조 타이밍을 다시 확인하세요."
											: "Audio is not stretched. Recheck narration and focus timing after changing scene lengths or order."}
									</p>
								)}
								{schedule.some((s) => s.zoom && s.durationSec < 3.2) && (
									<p className={styles.warning}>
										{ko
											? "3.2초 미만 장면은 줌 없이 조립합니다."
											: "Scenes shorter than 3.2 seconds are assembled without zoom."}
									</p>
								)}
								<p className={styles.note}>
									{ko
										? "시간은 30fps 프레임에 맞춰 계산합니다. 원본 촬영의 실제 프레임 빈도와는 다릅니다."
										: "Timing is quantized to 30fps; this is not the original capture frame rate."}
								</p>
								{invalid && (
									<p role="alert" className={styles.warning}>
										{invalid}
									</p>
								)}
								<div className={styles.actions}>
									<button
										type="button"
										disabled={!!invalid || proposalPending}
										onClick={() => void savePlan()}
									>
										{ko ? "기획 저장" : "Save plan"}
									</button>
									<button
										className={styles.primary}
										type="button"
										disabled={!!invalid || proposalPending}
										onClick={() => void assemble()}
									>
										{ko ? "새 편집 초안으로 조립" : "Assemble new draft"}
									</button>
								</div>
							</fieldset>
						</>
					)
				)}
				{busy && <p role="status">{ko ? "저장 중…" : "Saving…"}</p>}
				{message && <p role="status">{message}</p>}
				{error && (
					<p role="alert" className={styles.warning}>
						{error}
					</p>
				)}
			</div>
		</ModalShell>
	);
}
