// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AxcutDocument, createEmptyDocument } from "@/lib/ai-edition/schema";
import { initialScenePlan, type ScenePlan, withScenePlan } from "@/lib/scene-plan";
import { ScenePlanDialog } from "./ScenePlanDialog";

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ locale: "ko-KR" }) }));
vi.mock("./Modals", () => ({
	ModalShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("./SceneAnimaticPreview", () => ({
	SceneAnimaticPreview: ({ plan, focusSceneId }: { plan: ScenePlan; focusSceneId?: string }) => (
		<div
			data-testid="compositor"
			data-scene={focusSceneId}
			data-caption={plan.scenes.find((s) => s.id === focusSceneId)?.caption}
		/>
	),
}));
const mocks = vi.hoisted(() => ({ save: vi.fn(), saveDocument: vi.fn() }));
let doc: AxcutDocument;
const state = () => ({
	document: doc,
	projectId: doc.project.id,
	saveDocument: mocks.saveDocument,
	setPlaying: vi.fn(),
});
vi.mock("@/lib/ai-edition/store/projectStore", () => ({
	useProjectStore: Object.assign(
		(select: (s: ReturnType<typeof state>) => unknown) => select(state()),
		{ getState: () => state() },
	),
}));
vi.mock("@/native/client", () => ({ nativeBridgeClient: { aiEdition: { save: mocks.save } } }));
beforeEach(() => {
	vi.clearAllMocks();
	doc = createEmptyDocument({ projectId: "source", title: "장면 검증" });
	doc.assets.push({
		id: "video",
		kind: "video",
		label: "기존 영상",
		originalPath: "D:/qa/source.mp4",
		durationSec: 30,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
		cameraTrack: null,
	});
	mocks.saveDocument.mockResolvedValue(true);
	mocks.save.mockResolvedValue({ success: true });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
it("accepts an AI proposal into the scene sheet only, leaving save and assembly explicit", async () => {
	const next = initialScenePlan(doc);
	next.scenes[0].outSec = 8;
	next.scenes[0].caption = "AI 기획 제안 문장";
	const planner = vi.fn(async (request: import("@/lib/scene-planner").PlannerRequest) =>
		request.action === "generate"
			? {
					kind: "proposal",
					requestId: request.requestId,
					provider: "claude-local",
					model: "sonnet",
					proposal: {
						summary: "QA 계획",
						plan: next,
						missingMaterials: [],
						sceneNotes: next.scenes.map((s) => ({
							sceneId: s.id,
							basis: "brief",
							reason: "직접 확인 필요",
						})),
					},
				}
			: { kind: "info", info: { provider: "claude-local", model: "sonnet", routeKey: "route" } },
	);
	vi.stubGlobal("electronAPI", { scenePlanner: planner });
	render(<ScenePlanDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	fireEvent.click(screen.getByRole("tab", { name: "AI 기획" }));
	await screen.findByText("claude-local · sonnet");
	fireEvent.change(screen.getByLabelText("어떤 영상을 만들까요?"), {
		target: { value: "20초 소개 영상" },
	});
	fireEvent.click(screen.getByLabelText(/전송 내용을 확인했으며/));
	fireEvent.click(screen.getByText("AI 기획안 만들기"));
	await screen.findByText("QA 계획");
	expect(screen.getByTestId("plan-duration").textContent).toContain("18.00s");
	fireEvent.click(screen.getByText("기획안 채택 · 장면 시트로"));
	expect(
		screen.getByRole("tab", { name: "프리뷰 · 장면 시트" }).getAttribute("aria-selected"),
	).toBe("true");
	expect(screen.getByTestId("plan-duration").textContent).toContain("20.00s");
	expect(screen.getByText("AI 기획 제안 문장")).toBeTruthy();
	expect(mocks.saveDocument).not.toHaveBeenCalled();
	expect(mocks.save).not.toHaveBeenCalled();
});
it("navigates all planning tabs with the keyboard", () => {
	render(<ScenePlanDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	const first = screen.getByRole("tab", { name: "장면 구성" });
	first.focus();
	fireEvent.keyDown(first, { key: "End" });
	expect(screen.getByRole("tab", { name: "수정·검수" }).getAttribute("aria-selected")).toBe("true");
	fireEvent.keyDown(screen.getByRole("tab", { name: "수정·검수" }), { key: "ArrowRight" });
	expect(first.getAttribute("aria-selected")).toBe("true");
});
it("compares a proposed scene without changing the plan, then accepts, invalidates and undoes", async () => {
	render(<ScenePlanDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	fireEvent.click(screen.getByRole("tab", { name: "수정·검수" }));
	fireEvent.click(screen.getByText("화면을 직접 확인했음"));
	expect(screen.getByTestId("review-visual").textContent).toContain("사용자 확인됨");
	fireEvent.click(screen.getByText("이 장면 수정안 만들기"));
	fireEvent.change(screen.getByLabelText("1 장면 길이 초"), { target: { value: "7" } });
	fireEvent.change(screen.getByLabelText("1 화면에 표시할 문장"), { target: { value: "새 문장" } });
	expect(screen.getByTestId("plan-duration").textContent).toContain("18.00s");
	expect((screen.getByText("기획 저장") as HTMLButtonElement).disabled).toBe(true);
	expect((screen.getByRole("tab", { name: "장면 구성" }) as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByText("수정 전 합성 보기"));
	expect(screen.getByTestId("compositor").getAttribute("data-caption")).toBe("");
	fireEvent.click(screen.getByText("수정 후 합성 보기"));
	expect(screen.getByTestId("compositor").getAttribute("data-caption")).toBe("새 문장");
	expect(screen.getByTestId("compositor").getAttribute("data-scene")).toBe("scene_1");
	fireEvent.click(screen.getByText("수정안을 채택해 기획에 반영"));
	expect(screen.getByTestId("plan-duration").textContent).toContain("19.00s");
	expect(screen.getByTestId("review-visual").textContent).toContain("재검수 필요");
	expect(mocks.saveDocument).not.toHaveBeenCalled();
	fireEvent.click(screen.getByRole("tab", { name: "장면 구성" }));
	fireEvent.click(screen.getByRole("tab", { name: "수정·검수" }));
	fireEvent.click(screen.getByText("마지막 수정안 채택 취소"));
	expect(screen.getByTestId("plan-duration").textContent).toContain("18.00s");
	expect(screen.getByTestId("review-visual").textContent).toContain("사용자 확인됨");
	fireEvent.click(screen.getByText("기획 저장"));
	await waitFor(() => expect(mocks.saveDocument).toHaveBeenCalled());
	expect(
		mocks.saveDocument.mock.calls[0][0].legacyEditor.scenePlanChecks.entries.scene_1.visual
			.checkedAt,
	).toBeTruthy();
	expect(doc.timeline.clips).toHaveLength(0);
});
it("discarding a proposal preserves the current plan and later edits prevent unsafe undo", () => {
	render(<ScenePlanDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	fireEvent.click(screen.getByRole("tab", { name: "수정·검수" }));
	fireEvent.click(screen.getByText("이 장면 수정안 만들기"));
	fireEvent.change(screen.getByLabelText("1 장면 길이 초"), { target: { value: "8" } });
	fireEvent.click(screen.getByText("수정안 취소"));
	expect(screen.getByTestId("plan-duration").textContent).toContain("18.00s");
	fireEvent.click(screen.getByText("이 장면 수정안 만들기"));
	fireEvent.change(screen.getByLabelText("1 장면 길이 초"), { target: { value: "8" } });
	fireEvent.click(screen.getByText("수정안을 채택해 기획에 반영"));
	fireEvent.change(screen.getByLabelText("영상 제목"), { target: { value: "나중 수정" } });
	expect((screen.getByText("마지막 수정안 채택 취소") as HTMLButtonElement).disabled).toBe(true);
});
it("previews the same three-scene plan, reflows duration, and supports mobile scene sheets", () => {
	render(<ScenePlanDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	expect(screen.getByTestId("plan-duration").textContent).toContain("18.00s");
	fireEvent.change(screen.getByLabelText("1 장면 길이 초"), { target: { value: "7" } });
	fireEvent.change(screen.getByLabelText("2 화면에 표시할 문장"), {
		target: { value: "승인한 결정" },
	});
	fireEvent.click(screen.getByRole("tab", { name: "프리뷰 · 장면 시트" }));
	expect(screen.getByText("7.00–13.00s")).toBeTruthy();
	expect(screen.getByText("승인한 결정")).toBeTruthy();
	expect(screen.getAllByLabelText(/원본 미리보기/)).toHaveLength(3);
	fireEvent.click(screen.getByLabelText("모바일 폭 390px로 보기"));
	expect((screen.getByLabelText("모바일 폭 390px로 보기") as HTMLInputElement).checked).toBe(true);
	expect(mocks.save).not.toHaveBeenCalled();
});
it("restores a saved plan and saves explicit edits with undo enabled", async () => {
	const plan = initialScenePlan(doc);
	plan.scenes[0].title = "복원한 장면";
	doc = withScenePlan(doc, plan);
	render(<ScenePlanDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	expect((screen.getByLabelText("1 장면 제목") as HTMLInputElement).value).toBe("복원한 장면");
	fireEvent.click(screen.getByRole("button", { name: "기획 저장" }));
	await waitFor(() =>
		expect(mocks.saveDocument).toHaveBeenCalledWith(
			expect.objectContaining({ project: doc.project }),
			{ history: true },
		),
	);
});
it("only assembles after a click and opens a separate saved draft", async () => {
	const openDraft = vi.fn(async () => undefined),
		close = vi.fn();
	render(<ScenePlanDialog open onClose={close} onOpenDraft={openDraft} />);
	fireEvent.click(screen.getByRole("button", { name: "새 편집 초안으로 조립" }));
	await waitFor(() => expect(openDraft).toHaveBeenCalledOnce());
	const draft = mocks.save.mock.calls[0][0] as AxcutDocument;
	expect(draft.project.id).not.toBe(doc.project.id);
	expect(draft.timeline.clips).toHaveLength(3);
	expect(doc.timeline.clips).toHaveLength(0);
	expect(close).toHaveBeenCalledOnce();
});
it("does not navigate on save failure or invalid source ranges", async () => {
	const openDraft = vi.fn();
	mocks.save.mockResolvedValue({ success: false, error: "Disk full" });
	render(<ScenePlanDialog open onClose={vi.fn()} onOpenDraft={openDraft} />);
	fireEvent.click(screen.getByRole("button", { name: "새 편집 초안으로 조립" }));
	await screen.findByText(/Disk full/);
	expect(openDraft).not.toHaveBeenCalled();
	fireEvent.change(screen.getByLabelText("1 장면 길이 초"), { target: { value: "100" } });
	expect(
		(screen.getByRole("button", { name: "새 편집 초안으로 조립" }) as HTMLButtonElement).disabled,
	).toBe(true);
});
