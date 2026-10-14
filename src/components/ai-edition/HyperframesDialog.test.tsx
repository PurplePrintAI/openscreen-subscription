// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HyperframesRequest, HyperframesStatus } from "@/lib/hyperframes";
import { HyperframesDialog } from "./HyperframesDialog";

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ locale: "ko" }) }));
vi.mock("@/lib/ai-edition/store/projectStore", () => ({
	useProjectStore: (select: (state: unknown) => unknown) =>
		select({
			document: {
				project: { id: "proj_existing" },
				assets: [
					{ id: "take", kind: "video", label: "Test recording", originalPath: "private-path" },
				],
			},
		}),
}));
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
let current: HyperframesStatus;
let api: ReturnType<typeof vi.fn<(request: HyperframesRequest) => Promise<HyperframesStatus>>>;
beforeEach(() => {
	current = {
		phase: "idle",
		runtime: { available: true, version: "0.8.146", runtimeDir: "test-runtime" },
	};
	api = vi.fn(async (input: HyperframesRequest) => {
		if (input.action === "render")
			current = { ...current, phase: "ready", projectId: "proj_generated" };
		return current;
	});
	Object.defineProperty(window, "electronAPI", { configurable: true, value: { hyperframes: api } });
});
afterEach(cleanup);
it("offers setup guidance before showing raw runtime diagnostics", async () => {
	current.runtime.available = false;
	current.runtime.error = "ENOENT private-runtime-path";
	const setup = vi.fn();
	render(<HyperframesDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} onOpenSetup={setup} />);
	await screen.findByText(/로컬 모션 환경을 찾지 못했거나/);
	expect(screen.getByText("ENOENT private-runtime-path").closest("details")?.open).toBe(false);
	fireEvent.click(screen.getByRole("button", { name: "Studio 환경 설정 열기" }));
	expect(setup).toHaveBeenCalledOnce();
});
it("removes the previous ready project while a subsequent render is in flight", async () => {
	current = { ...current, phase: "ready", projectId: "proj_previous" };
	render(<HyperframesDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	await screen.findByText("Studio에서 열기");
	let complete: ((value: HyperframesStatus) => void) | undefined;
	api.mockImplementation((input) =>
		input.action === "render"
			? new Promise((resolve) => {
					complete = resolve;
				})
			: Promise.resolve(current),
	);
	fireEvent.click(screen.getByText("로컬 렌더링 → 새 프로젝트"));
	expect(screen.queryByText("Studio에서 열기")).toBeNull();
	complete?.({ ...current, phase: "ready", projectId: "proj_new" });
	await screen.findByText("Studio에서 열기");
});
it("labels defaults as diagnostic and requires a click before local rendering", async () => {
	const openDraft = vi.fn(async () => undefined);
	render(<HyperframesDialog open onClose={vi.fn()} onOpenDraft={openDraft} />);
	const renderButton = screen.getByText("로컬 렌더링 → 새 프로젝트");
	expect(screen.queryByLabelText("상단 라벨")).toBeNull();
	await waitFor(() => expect((renderButton as HTMLButtonElement).disabled).toBe(false));
	expect(screen.getByText(/기본값은 제품 데모가 아닌/)).toBeTruthy();
	expect(api.mock.calls.some(([request]) => request.action === "render")).toBe(false);
	fireEvent.click(renderButton);
	fireEvent.click(await screen.findByText("Studio에서 열기"));
	await waitFor(() => expect(openDraft).toHaveBeenCalledWith("proj_generated"));
});
it("sends a project asset ID and offset, never an arbitrary file path", async () => {
	render(<HyperframesDialog open onClose={vi.fn()} onOpenDraft={vi.fn()} />);
	await screen.findByText(/로컬 구성 확인됨/);
	fireEvent.change(screen.getByLabelText("영상 소스"), { target: { value: "take" } });
	fireEvent.change(screen.getByLabelText("원본 시작 시간 (초)"), { target: { value: "3" } });
	fireEvent.click(screen.getByText("로컬 렌더링 → 새 프로젝트"));
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith(
			expect.objectContaining({
				action: "render",
				scene: expect.objectContaining({
					source: { projectId: "proj_existing", assetId: "take", startSec: 3 },
				}),
			}),
		),
	);
	expect(JSON.stringify(api.mock.calls)).not.toContain("private-path");
});
it("disables rendering without a configured runtime and cancels on close", async () => {
	current.runtime.available = false;
	const close = vi.fn();
	render(<HyperframesDialog open onClose={close} onOpenDraft={vi.fn()} />);
	await waitFor(() => expect(api).toHaveBeenCalledWith({ action: "status" }));
	expect((screen.getByText("로컬 렌더링 → 새 프로젝트") as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByText("닫기"));
	expect(api).toHaveBeenCalledWith({ action: "cancel" });
	expect(close).toHaveBeenCalledOnce();
});
