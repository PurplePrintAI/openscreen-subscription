import { useEffect, useState } from "react";
import type { AxcutDocument } from "@/lib/ai-edition/schema";
import type { ScenePlan } from "@/lib/scene-plan";
import { scheduleScenes } from "@/lib/scene-plan";
import {
	type AcceptedSceneRevision,
	acceptSceneRevision,
	beginSceneRevision,
	markSceneChecked,
	type ReviewStatus,
	type SceneChecks,
	type SceneRevision,
	sceneCheckStatus,
	undoSceneRevision,
} from "@/lib/scene-review";
import { SceneAnimaticPreview } from "./SceneAnimaticPreview";
import styles from "./ScenePlanDialog.module.css";
import { ScenePlanFields } from "./ScenePlanFields";

export function SceneReviewPanel({
	plan,
	source,
	checks,
	onChecks,
	onPlan,
	onPendingChange,
	accepted,
	setAccepted,
	ko,
}: {
	plan: ScenePlan;
	source: AxcutDocument;
	checks: SceneChecks;
	onChecks: (checks: SceneChecks) => void;
	onPlan: (plan: ScenePlan) => void;
	onPendingChange: (value: boolean) => void;
	accepted: AcceptedSceneRevision | null;
	setAccepted: (value: AcceptedSceneRevision | null) => void;
	ko: boolean;
}) {
	const [selected, setSelected] = useState(plan.scenes[0].id);
	const [revision, setRevision] = useState<SceneRevision | null>(null);
	const [variant, setVariant] = useState<"before" | "after">("before");
	const [showPreview, setShowPreview] = useState(false);
	const [error, setError] = useState("");
	const editing = !!revision;
	useEffect(() => {
		onPendingChange(editing);
		return () => onPendingChange(false);
	}, [editing, onPendingChange]);
	const id = plan.scenes.some((s) => s.id === selected) ? selected : plan.scenes[0].id;
	const index = plan.scenes.findIndex((s) => s.id === id);
	const scene = plan.scenes[index];
	let proposed: ScenePlan | null = null,
		invalid = "";
	if (revision)
		try {
			proposed = acceptSceneRevision(plan, source, revision);
		} catch (e) {
			invalid = String(e);
		}
	const same = proposed && JSON.stringify(proposed) === JSON.stringify(revision?.base);
	const statuses = sceneCheckStatus(plan, source, checks, id);
	const statusLabel = (s: ReviewStatus) =>
		(ko
			? {
					pending: "확인 전",
					confirmed: "사용자 확인됨",
					stale: "재검수 필요",
					"not-required": "재사용 나레이션 없음",
				}
			: {
					pending: "Not checked",
					confirmed: "User checked",
					stale: "Recheck required",
					"not-required": "No reused narration",
				})[s];
	const act = (fn: () => void) => {
		setError("");
		try {
			fn();
		} catch (e) {
			setError(String(e));
		}
	};
	const canUndo = accepted && JSON.stringify(plan) === JSON.stringify(accepted.after);
	const activePlan = revision ? (variant === "after" ? proposed : revision.base) : plan;
	const before = revision ? scheduleScenes(revision.base).find((s) => s.id === id) : null;
	const after = proposed ? scheduleScenes(proposed).find((s) => s.id === id) : null;
	return (
		<div className={styles.scenes}>
			<p className={styles.note}>
				{ko
					? "수정안은 채택 전까지 기획에 반영되지 않습니다. 채택해도 원본 타임라인은 바뀌지 않습니다. 기획 저장 후 새 초안으로 조립할 수 있습니다."
					: "A proposal does not change the plan until accepted. It never overwrites the source timeline. Save the plan, then assemble a new draft."}
			</p>
			<label>
				{ko ? "검토할 장면" : "Scene to review"}
				<select
					value={id}
					disabled={!!revision}
					onChange={(e) => {
						setSelected(e.target.value);
						setShowPreview(false);
						setError("");
					}}
				>
					{plan.scenes.map((s, i) => (
						<option key={s.id} value={s.id}>
							{i + 1}. {s.title}
						</option>
					))}
				</select>
			</label>
			<div className={styles.actions}>
				<button
					type="button"
					disabled={!!revision}
					onClick={() =>
						act(() => {
							setRevision(beginSceneRevision(plan, source, id));
							setVariant("before");
							setShowPreview(false);
						})
					}
				>
					{ko ? "이 장면 수정안 만들기" : "Propose a scene change"}
				</button>
				<button
					type="button"
					disabled={!!revision || !canUndo}
					onClick={() =>
						act(() => {
							onPlan(undoSceneRevision(plan, accepted!));
							setAccepted(null);
							setShowPreview(false);
						})
					}
				>
					{ko ? "마지막 수정안 채택 취소" : "Undo last accepted proposal"}
				</button>
			</div>
			{revision && (
				<>
					<article className={styles.scene}>
						<h3>{ko ? "수정안" : "Proposal"}</h3>
						<ScenePlanFields
							scene={revision.candidate}
							assets={source.assets}
							i={index}
							ko={ko}
							onChange={(patch) =>
								setRevision({ ...revision, candidate: { ...revision.candidate, ...patch } })
							}
						/>
					</article>
					<div className={styles.comparison}>
						{[
							{ label: ko ? "수정 전" : "Before", value: before },
							{ label: ko ? "수정 후" : "After", value: after },
						].map(({ label, value }) => (
							<article key={label} className={styles.scene}>
								<h3>{label}</h3>
								{value ? (
									<>
										<p>{value.title}</p>
										<p>{value.caption || (ko ? "표시 문장 없음" : "No caption")}</p>
										<small>
											{ko ? "원본" : "Source"} {value.inSec.toFixed(2)}–{value.outSec.toFixed(2)}s
										</small>
										<small>
											{ko ? "완성 영상" : "Output"} {value.startSec.toFixed(2)}–
											{value.endSec.toFixed(2)}s
										</small>
										<small>
											{value.zoom
												? `${value.zoom.scale}× (${value.zoom.cx}, ${value.zoom.cy})`
												: ko
													? "줌 없음"
													: "No zoom"}
										</small>
									</>
								) : (
									<p>{ko ? "유효한 구간을 입력하세요." : "Enter a valid range."}</p>
								)}
							</article>
						))}
					</div>
					{before && after && before.durationSec !== after.durationSec && (
						<p className={styles.warning}>
							{ko
								? "길이 변경으로 뒤 장면의 시작 시점도 이동합니다. 이동한 장면의 검수와 음성 타이밍을 다시 확인하세요."
								: "Duration changes shift later scenes. Recheck their pictures and narration timing."}
						</p>
					)}
					<div className={styles.actions}>
						<button
							type="button"
							aria-pressed={showPreview && variant === "before"}
							onClick={() => {
								setVariant("before");
								setShowPreview(true);
							}}
						>
							{ko ? "수정 전 합성 보기" : "Preview before"}
						</button>
						<button
							type="button"
							disabled={!proposed}
							aria-pressed={showPreview && variant === "after"}
							onClick={() => {
								setVariant("after");
								setShowPreview(true);
							}}
						>
							{ko ? "수정 후 합성 보기" : "Preview after"}
						</button>
						<button
							type="button"
							className={styles.primary}
							disabled={!proposed || !!same}
							onClick={() =>
								act(() => {
									const next = acceptSceneRevision(plan, source, revision);
									setAccepted({ before: structuredClone(plan), after: next });
									onPlan(next);
									setRevision(null);
									setShowPreview(false);
								})
							}
						>
							{ko ? "수정안을 채택해 기획에 반영" : "Accept proposal into plan"}
						</button>
						<button
							type="button"
							onClick={() => {
								setRevision(null);
								setShowPreview(false);
								setError("");
							}}
						>
							{ko ? "수정안 취소" : "Discard proposal"}
						</button>
					</div>
					<p className={styles.note}>
						{ko
							? "수정안 채택은 기획 변경 승인입니다. 화면·음성 검수 완료 표시는 별도로 남깁니다."
							: "Accepting a proposal approves a planning change, not completion of visual/audio checks."}
					</p>
				</>
			)}
			{!revision && (
				<button type="button" onClick={() => setShowPreview((v) => !v)}>
					{showPreview
						? ko
							? "합성 보기 닫기"
							: "Close preview"
						: ko
							? "현재 장면 합성 보기"
							: "Preview current scene"}
				</button>
			)}
			{showPreview && activePlan && (
				<SceneAnimaticPreview
					key={`${id}-${variant}`}
					plan={activePlan}
					source={source}
					ko={ko}
					focusSceneId={id}
				/>
			)}
			<section
				className={styles.scene}
				aria-label={ko ? "선택 장면 검수" : "Selected scene checks"}
			>
				<h3>
					{scene.title} · {ko ? "검수" : "Checks"}
				</h3>
				<p className={styles.note}>
					{ko
						? "직접 확인한 경우에만 표시하세요. 렌더 성공이나 수정안 채택으로 자동 완료되지 않으며, 최종 출력 검증을 대신하지 않습니다."
						: "Mark only what you checked yourself. Rendering or accepting an edit never auto-approves it; this does not certify the exported video."}
				</p>
				{(["visual", "narration"] as const).map((kind) => (
					<div key={kind} className={styles.toolbar}>
						<span data-testid={`review-${kind}`}>
							{kind === "visual"
								? ko
									? "화면"
									: "Picture"
								: ko
									? "나레이션·타이밍"
									: "Narration/timing"}
							: {statusLabel(statuses[kind])}
						</span>
						<button
							type="button"
							disabled={
								!!revision || statuses[kind] === "not-required" || statuses[kind] === "confirmed"
							}
							onClick={() =>
								act(() =>
									onChecks(
										markSceneChecked(plan, source, checks, id, kind, new Date().toISOString()),
									),
								)
							}
						>
							{kind === "visual"
								? ko
									? "화면을 직접 확인했음"
									: "I checked the picture"
								: ko
									? "음성과 타이밍을 직접 확인했음"
									: "I checked narration timing"}
						</button>
					</div>
				))}
			</section>
			{(invalid || error) && (
				<p role="alert" className={styles.warning}>
					{invalid || error}
				</p>
			)}
		</div>
	);
}
