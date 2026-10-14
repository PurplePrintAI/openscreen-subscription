// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DemoRequest, DemoStatus } from "@/lib/product-demo";
import { ProductDemoDialog } from "./ProductDemoDialog";

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ locale: "ko-KR" }) }));
vi.mock("./Modals", () => ({
	ModalShell: ({
		open,
		children,
		onClose,
	}: {
		open: boolean;
		children: React.ReactNode;
		onClose: () => void;
	}) =>
		open ? (
			<div>
				<button type="button" onClick={onClose}>
					닫기
				</button>
				{children}
			</div>
		) : null,
}));

const review: DemoStatus = {
	phase: "review",
	jobId: "127424d5-8848-4e5b-bd3d-f03fd8aef720",
	plan: {
		title: "가치 소개",
		summary: "실제 제품을 소개합니다",
		scenes: [{ title: "소개", caption: "기존 자막", durationSec: 8, targetId: 1 }],
	},
};
let current: DemoStatus;
let api: ReturnType<typeof vi.fn<(input: DemoRequest) => Promise<DemoStatus>>>;
beforeEach(() => {
	current = { phase: "idle" };
	api = vi.fn(async (input: DemoRequest) => {
		if (input.action === "plan") current = review;
		if (input.action === "record") current = { ...review, phase: "ready", projectId: "proj_draft" };
		if (input.action === "cancel") current = { phase: "cancelled" };
		return current;
	});
	Object.defineProperty(window, "electronAPI", { configurable: true, value: { productDemo: api } });
});
afterEach(cleanup);

it("requires shot-plan review before recording and sends edited captions", async () => {
	const openDraft = vi.fn(async () => undefined);
	render(<ProductDemoDialog open onClose={vi.fn()} onOpenDraft={openDraft} />);
	fireEvent.click(screen.getByText("제품 열고 AI 촬영안 작성"));
	const record = await screen.findByText("이 촬영안으로 녹화·초안 만들기");
	expect(api.mock.calls.some(([input]) => input.action === "record")).toBe(false);
	fireEvent.change(screen.getByLabelText("자막"), { target: { value: "수정한 가치 설명" } });
	fireEvent.click(record);
	await screen.findByText("편집 초안 열기");
	const input = api.mock.calls
		.map(([request]) => request)
		.find((request) => request.action === "record");
	expect(input?.action === "record" && input.plan.scenes[0].caption).toBe("수정한 가치 설명");
	fireEvent.click(screen.getByText("편집 초안 열기"));
	await waitFor(() => expect(openDraft).toHaveBeenCalledWith("proj_draft"));
});

it("cancels the producer when closing its dialog", async () => {
	const close = vi.fn();
	render(<ProductDemoDialog open onClose={close} onOpenDraft={vi.fn()} />);
	fireEvent.click(screen.getByText("닫기"));
	expect(api).toHaveBeenCalledWith({ action: "cancel" });
	expect(close).toHaveBeenCalled();
});

it("reviews editable zoom timing and prevents recording an invalid interval", async () => {
	render(<ProductDemoDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	fireEvent.click(screen.getByText("제품 열고 AI 촬영안 작성"));
	const record = await screen.findByText("이 촬영안으로 녹화·초안 만들기");
	fireEvent.click(screen.getByLabelText("대상 영역 줌"));
	fireEvent.change(screen.getByLabelText("줌 복귀 시작 (초)"), { target: { value: "8" } });
	expect(record).toHaveProperty("disabled", true);
	fireEvent.change(screen.getByLabelText("줌 복귀 시작 (초)"), { target: { value: "6" } });
	fireEvent.change(screen.getByLabelText("배율"), { target: { value: "1.2" } });
	fireEvent.click(record);
	await screen.findByText("편집 초안 열기");
	const request = api.mock.calls.map(([input]) => input).find((input) => input.action === "record");
	expect(request?.action === "record" && request.plan.scenes[0].framing).toEqual({
		startSec: 3,
		endSec: 6,
		scale: 1.2,
	});
});

it("requires a fresh plan after revising the brief", async () => {
	render(<ProductDemoDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	fireEvent.click(screen.getByText("제품 열고 AI 촬영안 작성"));
	await screen.findByText("촬영안 취소·기획 수정");
	expect(screen.getByLabelText("제품 이름")).toHaveProperty("disabled", true);
	fireEvent.click(screen.getByText("촬영안 취소·기획 수정"));
	await waitFor(() => expect(screen.getByLabelText("제품 이름")).toHaveProperty("disabled", false));
	expect(screen.queryByText("이 촬영안으로 녹화·초안 만들기")).toBeNull();
});
