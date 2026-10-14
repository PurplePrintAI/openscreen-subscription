import { useEffect, useRef, useState } from "react";
import type { AxcutDocument } from "@/lib/ai-edition/schema";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type { ScenePlan } from "@/lib/scene-plan";
import { scheduleScenes } from "@/lib/scene-plan";
import {
	buildPlannerContext,
	type PlannerInfo,
	type PlanningBrief,
	plannerSourceKey,
	type SceneProposal,
	validateSceneProposal,
} from "@/lib/scene-planner";
import { SceneAnimaticPreview } from "./SceneAnimaticPreview";
import styles from "./ScenePlanDialog.module.css";

export function ScenePlannerPanel({
	source,
	plan,
	ko,
	onAccept,
	onPendingChange,
}: {
	source: AxcutDocument;
	plan: ScenePlan | null;
	ko: boolean;
	onAccept: (plan: ScenePlan) => void;
	onPendingChange: (pending: boolean) => void;
}) {
	const [brief, setBrief] = useState<PlanningBrief>({
		request: "",
		maxDurationSec: 20,
		includeTranscript: false,
	});
	const [info, setInfo] = useState<PlannerInfo | null>(null);
	const [consent, setConsent] = useState(false);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const [result, setResult] = useState<{
		proposal: SceneProposal;
		baseKey: string;
		brief: PlanningBrief;
		provider: string;
		model: string;
	} | null>(null);
	const [preview, setPreview] = useState(false);
	const requestId = useRef<string | null>(null);
	const api = window.electronAPI?.scenePlanner;
	const refreshInfo = async () => {
		setConsent(false);
		setError("");
		try {
			if (!api)
				throw new Error(
					ko
						? "이 빌드는 AI 기획을 지원하지 않습니다."
						: "AI planning is unavailable in this build.",
				);
			const response = await api({ action: "info" });
			if (response.kind === "info") setInfo(response.info);
		} catch (e) {
			setError(String(e));
		}
	};
	useEffect(() => {
		let mounted = true;
		if (api)
			void api({ action: "info" })
				.then((reply) => {
					if (mounted && reply.kind === "info") setInfo(reply.info);
				})
				.catch((e) => {
					if (mounted) setError(String(e));
				});
		return () => {
			mounted = false;
			const id = requestId.current;
			requestId.current = null;
			if (id && api) void api({ action: "cancel", requestId: id }).catch(() => undefined);
		};
	}, [api]);
	useEffect(() => {
		onPendingChange(busy || result !== null);
		return () => onPendingChange(false);
	}, [busy, result, onPendingChange]);
	const sourceKey = plannerSourceKey(source, plan);
	const disclosedSource = useRef(sourceKey);
	useEffect(() => {
		if (disclosedSource.current !== sourceKey) {
			disclosedSource.current = sourceKey;
			setConsent(false);
		}
	}, [sourceKey]);
	const stale = !!result && sourceKey !== result.baseKey;
	let payload = "",
		contextError = "";
	try {
		payload = JSON.stringify(buildPlannerContext(source, plan, brief), null, 2);
	} catch (e) {
		contextError = String(e);
	}
	const update = (patch: Partial<PlanningBrief>) => {
		setBrief((b) => ({ ...b, ...patch }));
		setConsent(false);
	};
	const generate = async () => {
		if (!api || !info || !consent || requestId.current || result || contextError) return;
		const id = crypto.randomUUID(),
			input = structuredClone(brief),
			baseKey = sourceKey;
		requestId.current = id;
		setBusy(true);
		setError("");
		setPreview(false);
		try {
			const reply = await api({
				action: "generate",
				requestId: id,
				consent: true,
				routeKey: info.routeKey,
				brief: input,
				document: source,
				currentPlan: plan,
			});
			if (requestId.current !== id) return;
			if (reply.kind !== "proposal" || reply.requestId !== id)
				throw new Error("Unexpected planning response.");
			const proposal = validateSceneProposal(reply.proposal, source, plan, input);
			setResult({ proposal, baseKey, brief: input, provider: reply.provider, model: reply.model });
		} catch (e) {
			if (requestId.current === id) setError(String(e));
		} finally {
			if (requestId.current === id) {
				requestId.current = null;
				setBusy(false);
				setConsent(false);
			}
		}
	};
	const cancel = async () => {
		const id = requestId.current;
		requestId.current = null;
		setBusy(false);
		setConsent(false);
		if (id && api) {
			try {
				await api({ action: "cancel", requestId: id });
			} catch (e) {
				setError(String(e));
			}
		}
	};
	const accept = () => {
		if (!result?.proposal.plan) return;
		try {
			const current = useProjectStore.getState().document;
			if (!current || plannerSourceKey(current, plan) !== result.baseKey)
				throw new Error(
					ko
						? "소스 또는 기획이 바뀌었습니다. 새 기획안을 요청해 주세요."
						: "Source or plan changed. Request a new proposal.",
				);
			const checked = validateSceneProposal(result.proposal, current, plan, result.brief);
			onAccept(checked.plan!);
			setResult(null);
			setPreview(false);
		} catch (e) {
			setError(String(e));
		}
	};
	return (
		<div className={styles.scenes}>
			<p className={styles.note}>
				{ko
					? "제작 의도를 적으면 현재 AI 연결로 장면 기획안만 만듭니다. 편집·촬영·이미지·음성 생성·게시는 실행하지 않습니다."
					: "Describe your intent to propose a scene plan using your configured AI. This does not edit, record, generate media or publish."}
			</p>
			<p>
				{info
					? `${info.provider} · ${info.model}`
					: ko
						? "먼저 AI 설정에서 공급자를 연결해 주세요."
						: "Connect a provider in AI settings first."}
			</p>
			<button type="button" disabled={busy || !!result} onClick={() => void refreshInfo()}>
				{ko ? "AI 연결 다시 확인" : "Refresh AI connection"}
			</button>
			<fieldset disabled={busy || !!result} className={styles.fields}>
				<label>
					{ko ? "어떤 영상을 만들까요?" : "What should this film communicate?"}
					<textarea
						rows={5}
						maxLength={6000}
						value={brief.request}
						onChange={(e) => update({ request: e.target.value })}
						placeholder={
							ko
								? "누가 보고, 무엇을 이해하거나 행동하길 바라나요? 하나의 사례와 보여줄 소스 구간을 적어 주세요."
								: "Audience, intended result, one example and known source ranges."
						}
					/>
				</label>
				<label>
					{ko ? "최대 길이 (초)" : "Maximum length (seconds)"}
					<input
						type="number"
						min={3}
						max={300}
						value={brief.maxDurationSec}
						onChange={(e) => update({ maxDurationSec: e.target.valueAsNumber })}
					/>
				</label>
				<label className={styles.check}>
					<input
						type="checkbox"
						checked={brief.includeTranscript}
						onChange={(e) => update({ includeTranscript: e.target.checked })}
					/>
					{ko
						? "전사문 일부 포함 (최대 120개 구간, 구간당 400자)"
						: "Include transcript excerpts (up to 120 segments, 400 characters each)"}
				</label>
			</fieldset>
			<p className={styles.warning}>
				{ko
					? "AI는 영상 화면을 보지 않습니다. 요청·프로젝트 제목·영상 이름/길이·현재 기획을 전송하며, 전사문은 선택할 때만 포함합니다. 영상 파일·로컬 경로·음성 원본·대화 기록은 전송하지 않습니다. 영상 이름과 요청에 민감한 정보가 없는지 확인하세요."
					: "AI cannot see the footage. The request, project title, media names/durations and current plan are sent; transcript excerpts are optional. No media files, local paths, voice references or chat history are sent. Check names and text for sensitive information."}
			</p>
			<details>
				<summary>{ko ? "AI에 전송할 내용 확인" : "Inspect provider payload"}</summary>
				<pre className={styles.payload}>{payload || contextError}</pre>
			</details>
			{!result && (
				<>
					<label className={styles.check}>
						<input
							type="checkbox"
							checked={consent}
							disabled={busy || !info}
							onChange={(e) => setConsent(e.target.checked)}
						/>
						{ko
							? "전송 내용을 확인했으며 AI 기획 생성을 요청합니다. 계정 사용량이 발생할 수 있습니다."
							: "I reviewed the data and request AI planning. Account usage may apply."}
					</label>
					<div className={styles.actions}>
						<button
							type="button"
							disabled={
								busy ||
								!info ||
								!consent ||
								!brief.request.trim() ||
								!Number.isInteger(brief.maxDurationSec) ||
								brief.maxDurationSec < 3 ||
								brief.maxDurationSec > 300 ||
								!!contextError
							}
							onClick={() => void generate()}
						>
							{ko ? "AI 기획안 만들기" : "Generate plan proposal"}
						</button>
						{busy && (
							<button type="button" onClick={() => void cancel()}>
								{ko ? "기획 요청 취소" : "Cancel request"}
							</button>
						)}
					</div>
				</>
			)}
			{busy && (
				<p role="status">
					{ko
						? "AI가 기획안을 작성 중입니다… 최대 3분, 자동 재요청 없음"
						: "Planning… up to three minutes, no automatic resubmission"}
				</p>
			)}
			{result && (
				<section className={styles.scenes} aria-label={ko ? "AI 기획 제안" : "AI plan proposal"}>
					<h3>{ko ? "검토할 기획안" : "Proposal to review"}</h3>
					<p>{result.proposal.summary}</p>
					<p className={styles.note}>
						{result.provider} · {result.model} ·{" "}
						{ko ? "영상 화면 미확인 · 자동 적용 안 됨" : "Footage not viewed · Not applied"}
					</p>
					{result.proposal.missingMaterials.length > 0 && (
						<div className={styles.warning}>
							<h4>{ko ? "부족한 자료·확인할 사항" : "Missing materials / checks"}</h4>
							<ul>
								{result.proposal.missingMaterials.map((item, i) => (
									<li key={`${i}-${item}`}>{item}</li>
								))}
							</ul>
						</div>
					)}
					{result.proposal.plan &&
						scheduleScenes(result.proposal.plan).map((scene) => (
							<article className={styles.scene} key={scene.id}>
								<h4>
									{scene.title} · {scene.startSec.toFixed(2)}–{scene.endSec.toFixed(2)}s
								</h4>
								<p>{scene.caption}</p>
								<small>
									{source.assets.find((a) => a.id === scene.assetId)?.label} ·{" "}
									{scene.inSec.toFixed(2)}–{scene.outSec.toFixed(2)}s
								</small>
								<p>{result.proposal.sceneNotes.find((n) => n.sceneId === scene.id)?.reason}</p>
								<small>
									{ko ? "선택 근거" : "Basis"}:{" "}
									{result.proposal.sceneNotes.find((n) => n.sceneId === scene.id)?.basis}
								</small>
							</article>
						))}
					{stale && (
						<p role="alert" className={styles.warning}>
							{ko
								? "기획 또는 소스가 변경되어 이 제안을 채택할 수 없습니다."
								: "Plan or source changed; this proposal is stale."}
						</p>
					)}
					<div className={styles.actions}>
						{result.proposal.plan && (
							<button type="button" disabled={stale} onClick={() => setPreview((v) => !v)}>
								{ko ? "제안 애니매틱 보기·닫기" : "Toggle proposed animatic"}
							</button>
						)}
						<button type="button" disabled={!result.proposal.plan || stale} onClick={accept}>
							{ko ? "기획안 채택 · 장면 시트로" : "Accept plan · Open scene sheet"}
						</button>
						<button
							type="button"
							onClick={() => {
								setResult(null);
								setPreview(false);
								setError("");
							}}
						>
							{ko ? "제안 닫기 · 기존 기획 유지" : "Discard · Keep existing plan"}
						</button>
					</div>
					<p className={styles.note}>
						{ko
							? "제안은 임시입니다. 채택은 기획 화면만 바꿉니다. 채택 후 ‘기획 저장’을 눌러 보존하고, 검수한 뒤 ‘새 편집 초안으로 조립’을 선택하세요."
							: "This proposal is temporary. Accept changes only the planning view. Save the plan, review it, then assemble a separate draft."}
					</p>
					{preview && result.proposal.plan && !stale && (
						<SceneAnimaticPreview plan={result.proposal.plan} source={source} ko={ko} />
					)}
				</section>
			)}
			{(error || contextError) && (
				<p role="alert" className={styles.warning}>
					{error || contextError}
				</p>
			)}
		</div>
	);
}
