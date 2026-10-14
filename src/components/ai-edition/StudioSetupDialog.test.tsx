// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StudioSetupReply, StudioSetupRequest, StudioSetupSnapshot } from "@/lib/studio-setup";
import { StudioSetupDialog } from "./StudioSetupDialog";

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
let state: StudioSetupSnapshot;
let api: ReturnType<typeof vi.fn<(r: StudioSetupRequest) => Promise<StudioSetupReply>>>;
beforeEach(() => {
	const empty = {
		paths: {},
		issues: {},
		configured: false,
		valid: false,
		changed: false,
		readOnly: false,
	};
	state = {
		cli: { codex: { found: true }, claude: { found: false } },
		narration: { ...empty },
		hyperframes: { ...empty },
	};
	api = vi.fn(async (request) => {
		if (request.action === "pick")
			state.narration = {
				...state.narration,
				paths: { pythonPath: "D:/voice/python.exe" },
				valid: true,
				changed: true,
			};
		return {
			snapshot: structuredClone(state),
			...(request.action === "save" ? { result: "saved" as const } : {}),
		};
	});
	Object.defineProperty(window, "electronAPI", { configurable: true, value: { studioSetup: api } });
});
afterEach(cleanup);
it("shows discovery separately from login and does not save or generate on opening", async () => {
	render(<StudioSetupDialog open onClose={vi.fn()} onOpenProviders={vi.fn()} />);
	await screen.findByText("실행 파일 발견");
	expect(screen.getByText(/발견은 로그인/)).toBeTruthy();
	expect(api.mock.calls.map(([r]) => r.action)).toEqual(["reset"]);
	expect(screen.getByRole("button", { name: "음성 환경 저장" }).hasAttribute("disabled")).toBe(
		true,
	);
});
it("uses a field-only picker and requires explicit trust after each selection", async () => {
	render(<StudioSetupDialog open onClose={vi.fn()} onOpenProviders={vi.fn()} />);
	fireEvent.click(await screen.findByRole("button", { name: "Python 실행 파일 선택" }));
	await screen.findByText("D:/voice/python.exe");
	expect(api).toHaveBeenCalledWith({ action: "pick", field: "pythonPath" });
	const card = screen.getByRole("region", { name: "한국어 나레이션" });
	expect(
		within(card).getByRole("button", { name: "음성 환경 저장" }).hasAttribute("disabled"),
	).toBe(true);
	fireEvent.click(within(card).getByRole("checkbox"));
	fireEvent.click(within(card).getByRole("button", { name: "음성 환경 저장" }));
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith({
			action: "save",
			kind: "narration",
			trustLocalRuntime: true,
		}),
	);
	await screen.findByText(/저장했습니다/);
});
it("ignores late status responses after closing and reopening", async () => {
	let complete: ((r: StudioSetupReply) => void) | undefined;
	api.mockImplementationOnce(
		() =>
			new Promise((resolve) => {
				complete = resolve;
			}),
	);
	const props = { onClose: vi.fn(), onOpenProviders: vi.fn() };
	const view = render(<StudioSetupDialog open {...props} />);
	view.rerender(<StudioSetupDialog open={false} {...props} />);
	view.rerender(<StudioSetupDialog open {...props} />);
	await screen.findByText("실행 파일 발견");
	complete?.({
		snapshot: { ...state, cli: { codex: { found: false }, claude: { found: false } } },
	});
	await waitFor(() => expect(screen.getByText("실행 파일 발견")).toBeTruthy());
});
