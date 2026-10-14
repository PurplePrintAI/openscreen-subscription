// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { NarrationInstallRequest, VoiceInstallStatus } from "@/lib/narration-install";
import { NarrationInstallDialog } from "./NarrationInstallDialog";

vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ locale: "ko-KR" }) }));
vi.mock("./Modals", () => ({
	ModalShell: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
		open ? <div>{children}</div> : null,
}));
let state: VoiceInstallStatus;
let api: ReturnType<typeof vi.fn<(r: NarrationInstallRequest) => Promise<VoiceInstallStatus>>>;
beforeEach(() => {
	state = { phase: "idle", paths: {} };
	api = vi.fn(async (request) => {
		if (request.action === "plan")
			state = {
				...state,
				phase: "review",
				plan: {
					id: "a24802cc-d5bf-4369-b32a-84fd515de341",
					mode: request.mode,
					pythonPath: "D:/python.exe",
					modelPath: "D:/model",
					model: "Qwen CustomVoice",
					revision: "fixed",
					bytes: 4520217432,
					downloadBytes: request.mode === "download" ? 4520217432 : 0,
					requiredFreeBytes: 5e9,
					freeBytes: 10e9,
					expiresAt: Date.now() + 60_000,
					issues: [],
				},
			};
		if (request.action === "install") state = { ...state, phase: "complete" };
		return structuredClone(state);
	});
	Object.defineProperty(window, "electronAPI", {
		configurable: true,
		value: { narrationInstall: api },
	});
});
afterEach(cleanup);
it("opening never installs; explicit trust precedes diagnosis and a separate confirmation precedes download", async () => {
	render(<NarrationInstallDialog open onClose={vi.fn()} />);
	await waitFor(() => expect(api).toHaveBeenCalledWith({ action: "status" }));
	expect(api.mock.calls.map(([r]) => r.action)).toEqual(["status"]);
	expect((screen.getByText("진단·설치 계획 확인") as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByRole("checkbox"));
	fireEvent.click(screen.getByText("진단·설치 계획 확인"));
	const install = await screen.findByText("용량·경로 확인 · 다운로드 및 연결");
	expect(api).toHaveBeenCalledWith({ action: "plan", mode: "download", trustPython: true });
	expect(api.mock.calls.some(([r]) => r.action === "install")).toBe(false);
	fireEvent.click(install);
	await screen.findByText(/기본 음성 모델 연결 완료/);
	expect(api).toHaveBeenCalledWith({ action: "install", planId: state.plan!.id, confirm: true });
});
it("changing modes invalidates approval, and unmount cancels outstanding work", async () => {
	const view = render(<NarrationInstallDialog open onClose={vi.fn()} />);
	fireEvent.click(screen.getByRole("checkbox"));
	fireEvent.click(screen.getByText("진단·설치 계획 확인"));
	await screen.findByText("용량·경로 확인 · 다운로드 및 연결");
	fireEvent.click(screen.getByText("기존 모델 재사용"));
	expect(screen.queryByText("용량·경로 확인 · 다운로드 및 연결")).toBeNull();
	expect((screen.getByText("진단·설치 계획 확인") as HTMLButtonElement).disabled).toBe(true);
	view.unmount();
	expect(api).toHaveBeenCalledWith({ action: "cancel" });
});
