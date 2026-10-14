// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { type AxcutDocument, createEmptyDocument } from "@/lib/ai-edition/schema";
import { initialScenePlan } from "@/lib/scene-plan";
import type { PlannerReply, PlannerRequest } from "@/lib/scene-planner";
import { ScenePlannerPanel } from "./ScenePlannerPanel";

let doc: AxcutDocument;
const api = vi.fn<(request: PlannerRequest) => Promise<PlannerReply>>();
const accept = vi.fn(),
	pending = vi.fn();
const info = { provider: "claude-local", model: "sonnet", routeKey: "route" };
vi.mock("@/lib/ai-edition/store/projectStore", () => ({
	useProjectStore: { getState: () => ({ document: doc }) },
}));
vi.mock("./SceneAnimaticPreview", () => ({
	SceneAnimaticPreview: () => <div>Native preview boundary</div>,
}));
beforeEach(() => {
	vi.clearAllMocks();
	doc = createEmptyDocument({ projectId: "qa", title: "Product" });
	doc.assets.push({
		id: "v",
		kind: "video",
		label: "Demo",
		originalPath: "D:/private.mp4",
		durationSec: 30,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
		cameraTrack: null,
	});
	api.mockResolvedValue({ kind: "info", info });
	vi.stubGlobal("electronAPI", { scenePlanner: api });
});
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});
function show() {
	return render(
		<ScenePlannerPanel
			source={doc}
			plan={initialScenePlan(doc)}
			ko
			onAccept={accept}
			onPendingChange={pending}
		/>,
	);
}
function reply(requestId: string): PlannerReply {
	const plan = initialScenePlan(doc);
	return {
		kind: "proposal",
		requestId,
		provider: info.provider,
		model: info.model,
		proposal: {
			summary: "검토용 기획",
			plan,
			missingMaterials: ["실제 화면 확인 필요"],
			sceneNotes: plan.scenes.map((s) => ({
				sceneId: s.id,
				basis: "metadata",
				reason: "화면을 확인해 주세요",
			})),
		},
	};
}
async function submit() {
	await screen.findByText("claude-local · sonnet");
	fireEvent.change(screen.getByLabelText("어떤 영상을 만들까요?"), {
		target: { value: "하나의 사례로 20초 소개" },
	});
	fireEvent.click(screen.getByLabelText(/전송 내용을 확인했으며/));
	await act(async () => {
		fireEvent.click(screen.getByText("AI 기획안 만들기"));
	});
}
it("requires explicit disclosure consent, previews without applying, and accepts only on click", async () => {
	api.mockImplementation(async (r) =>
		r.action === "generate" ? reply(r.requestId) : { kind: "info", info },
	);
	show();
	expect((screen.getByText("AI 기획안 만들기") as HTMLButtonElement).disabled).toBe(true);
	await submit();
	await screen.findByText("검토용 기획");
	expect(api.mock.calls.filter(([r]) => r.action === "generate")).toHaveLength(1);
	expect(accept).not.toHaveBeenCalled();
	expect(pending).toHaveBeenLastCalledWith(true);
	fireEvent.click(screen.getByText("제안 애니매틱 보기·닫기"));
	expect(screen.getByText("Native preview boundary")).toBeTruthy();
	expect(accept).not.toHaveBeenCalled();
	fireEvent.click(screen.getByText("기획안 채택 · 장면 시트로"));
	expect(accept).toHaveBeenCalledOnce();
	expect(doc.timeline.clips).toHaveLength(0);
});
it("discards without applying and clears consent when the brief changes", async () => {
	api.mockImplementation(async (r) =>
		r.action === "generate" ? reply(r.requestId) : { kind: "info", info },
	);
	show();
	await submit();
	await screen.findByText("검토용 기획");
	fireEvent.click(screen.getByText("제안 닫기 · 기존 기획 유지"));
	expect(accept).not.toHaveBeenCalled();
	fireEvent.click(screen.getByLabelText(/전송 내용을 확인했으며/));
	fireEvent.change(screen.getByLabelText("최대 길이 (초)"), { target: { value: "15" } });
	expect((screen.getByLabelText(/전송 내용을 확인했으며/) as HTMLInputElement).checked).toBe(false);
});
it("rejects a result if project state changed before acceptance", async () => {
	api.mockImplementation(async (r) =>
		r.action === "generate" ? reply(r.requestId) : { kind: "info", info },
	);
	show();
	await submit();
	await screen.findByText("검토용 기획");
	doc = { ...doc, project: { ...doc.project, id: "different" } };
	fireEvent.click(screen.getByText("기획안 채택 · 장면 시트로"));
	expect(await screen.findByRole("alert")).toHaveProperty(
		"textContent",
		expect.stringContaining("소스 또는 기획"),
	);
	expect(accept).not.toHaveBeenCalled();
});
it("ignores late completion after cancellation, and aborts an outstanding request on unmount", async () => {
	let finish: (r: PlannerReply) => void = () => undefined,
		id = "";
	api.mockImplementation((r) => {
		if (r.action === "generate") {
			id = r.requestId;
			return new Promise((resolve) => {
				finish = resolve;
			});
		}
		return Promise.resolve(r.action === "info" ? { kind: "info", info } : { kind: "cancelled" });
	});
	const ui = show();
	await submit();
	fireEvent.click(screen.getByText("기획 요청 취소"));
	await act(async () => {
		finish(reply(id));
	});
	await waitFor(() => expect(api).toHaveBeenCalledWith({ action: "cancel", requestId: id }));
	expect(screen.queryByText("검토용 기획")).toBeNull();
	await submit();
	ui.unmount();
	expect(api.mock.calls.filter(([r]) => r.action === "cancel")).toHaveLength(2);
	expect(accept).not.toHaveBeenCalled();
});
it("shows no-plan missing-material responses without enabling acceptance", async () => {
	api.mockImplementation(async (r) =>
		r.action === "generate"
			? {
					kind: "proposal",
					requestId: r.requestId,
					provider: info.provider,
					model: info.model,
					proposal: {
						summary: "촬영 필요",
						plan: null,
						missingMaterials: ["제품 기능 촬영"],
						sceneNotes: [],
					},
				}
			: { kind: "info", info },
	);
	show();
	await submit();
	await screen.findByText("촬영 필요");
	expect((screen.getByText("기획안 채택 · 장면 시트로") as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByText("제품 기능 촬영")).toBeTruthy();
});
