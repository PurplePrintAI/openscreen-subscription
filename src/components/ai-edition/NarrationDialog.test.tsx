// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import type { NarrationRequest, NarrationStatus } from "@/lib/narration";
import { NarrationDialog } from "./NarrationDialog";

const mock = vi.hoisted(() => ({
	state: { document: null as unknown, setPlaying: vi.fn(), saveDocument: vi.fn() },
}));
vi.mock("@/contexts/I18nContext", () => ({ useI18n: () => ({ locale: "ko-KR" }) }));
vi.mock("@/lib/ai-edition/store/projectStore", () => ({
	useProjectStore: Object.assign((select: (state: unknown) => unknown) => select(mock.state), {
		getState: () => mock.state,
	}),
}));
vi.mock("./Modals", () => ({
	ModalShell: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
		open ? <div>{children}</div> : null,
}));
let status: NarrationStatus;
let api: ReturnType<typeof vi.fn<(r: NarrationRequest) => Promise<NarrationStatus>>>;
beforeEach(() => {
	status = { phase: "idle", runtime: { available: true, presetToneControl: true } };
	mock.state.document = createEmptyDocument({ projectId: "qa", title: "QA" });
	mock.state.saveDocument.mockReset().mockResolvedValue(true);
	vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {
		// jsdom has no audio playback device.
	});
	api = vi.fn(async (r) => {
		if (r.action === "generate")
			status = {
				...status,
				phase: "ready",
				take: {
					jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
					projectId: r.input.projectId,
					text: r.input.text,
					mode: r.input.mode,
					audioPath: "C:/voice.wav",
					durationSec: 5,
					...(r.input.mode === "preset" ? { tone: r.input.tone } : {}),
				},
			};
		return status;
	});
	Object.defineProperty(window, "electronAPI", { configurable: true, value: { narration: api } });
});
afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});
it("requires preview before apply, stores layer and preserves the document", async () => {
	const close = vi.fn();
	const view = render(<NarrationDialog open onClose={close} />);
	await screen.findByText(/로컬 런타임 구성됨/);
	fireEvent.change(screen.getByLabelText("대본"), { target: { value: "한국어 대본입니다." } });
	fireEvent.click(screen.getByText("나레이션 생성"));
	await waitFor(() => expect(view.container.querySelector("audio")).not.toBeNull());
	expect((screen.getByText("영상에 적용") as HTMLButtonElement).disabled).toBe(true);
	fireEvent.playing(view.container.querySelector("audio")!);
	fireEvent.change(screen.getByLabelText(/시작 위치/), { target: { value: "1.5" } });
	fireEvent.click(screen.getByText("영상에 적용"));
	await waitFor(() => expect(close).toHaveBeenCalled());
	expect(mock.state.saveDocument).toHaveBeenCalledWith(
		expect.objectContaining({
			legacyEditor: expect.objectContaining({
				narration: expect.objectContaining({
					offsetSec: 1.5,
					mode: "preset",
					tone: { preset: "confident" },
				}),
			}),
		}),
		{ history: true },
	);
});
it("clone reference picker is locked until explicit permission", async () => {
	render(<NarrationDialog open onClose={vi.fn()} />);
	await screen.findByText(/로컬 런타임 구성됨/);
	fireEvent.change(screen.getByLabelText("목소리"), { target: { value: "clone" } });
	expect((screen.getByText("녹음 선택 · 자동 전사") as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByRole("checkbox"));
	fireEvent.click(screen.getByText("녹음 선택 · 자동 전사"));
	await waitFor(() =>
		expect(api).toHaveBeenCalledWith({ action: "pick-reference", speakerConsent: true }),
	);
	expect(mock.state.saveDocument).not.toHaveBeenCalled();
});
it("editing the script invalidates a previously heard generated take", async () => {
	const view = render(<NarrationDialog open onClose={vi.fn()} />);
	await screen.findByText(/로컬 런타임 구성됨/);
	fireEvent.change(screen.getByLabelText("대본"), { target: { value: "원래 대본" } });
	fireEvent.click(screen.getByText("나레이션 생성"));
	await waitFor(() => expect(view.container.querySelector("audio")).not.toBeNull());
	fireEvent.playing(view.container.querySelector("audio")!);
	fireEvent.change(screen.getByLabelText("대본"), { target: { value: "다른 대본" } });
	expect((screen.getByText("영상에 적용") as HTMLButtonElement).disabled).toBe(true);
});
it("tunes A, invalidates B audition and applies only the newly heard take", async () => {
	const view = render(<NarrationDialog open onClose={vi.fn()} />);
	await screen.findByText(/로컬 런타임 구성됨/);
	expect((screen.getByLabelText("나레이션 톤") as HTMLSelectElement).value).toBe("confident");
	fireEvent.change(screen.getByLabelText("대본"), { target: { value: "대본" } });
	fireEvent.click(screen.getByText("나레이션 생성"));
	await waitFor(() => expect(view.container.querySelector("audio")).not.toBeNull());
	fireEvent.playing(view.container.querySelector("audio")!);
	fireEvent.change(screen.getByLabelText("나레이션 톤"), { target: { value: "bright" } });
	fireEvent.change(screen.getByLabelText(/세부 톤 조절/), { target: { value: "조금 빠르게" } });
	expect((screen.getByText("영상에 적용") as HTMLButtonElement).disabled).toBe(true);
	fireEvent.click(screen.getByText("나레이션 생성"));
	await waitFor(() =>
		expect(api).toHaveBeenLastCalledWith({
			action: "generate",
			input: {
				mode: "preset",
				text: "대본",
				projectId: "qa",
				tone: { preset: "bright", direction: "조금 빠르게" },
			},
		}),
	);
	await waitFor(() => expect(view.container.querySelector("audio")).not.toBeNull());
	fireEvent.play(view.container.querySelector("audio")!);
	expect((screen.getByText("영상에 적용") as HTMLButtonElement).disabled).toBe(true);
	fireEvent.playing(view.container.querySelector("audio")!);
	fireEvent.click(screen.getByText("영상에 적용"));
	await waitFor(() => expect(mock.state.saveDocument).toHaveBeenCalled());
	expect(mock.state.saveDocument.mock.calls[0][0].legacyEditor.narration.tone).toEqual({
		preset: "bright",
		direction: "조금 빠르게",
	});
});
it("shows missing style capability and restores legacy audio without labeling it B", async () => {
	status.runtime.presetToneControl = false;
	const doc = createEmptyDocument({ projectId: "qa", title: "QA" });
	doc.legacyEditor = {
		narration: {
			version: 1,
			jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
			projectId: "qa",
			mode: "preset",
			text: "이전 음성",
			audioPath: "C:/old.wav",
			durationSec: 5,
			offsetSec: 1,
			originalGain: 0.4,
		},
	};
	mock.state.document = doc;
	const view = render(<NarrationDialog open onClose={vi.fn()} />);
	await screen.findByText(/로컬 런타임 구성됨/);
	expect((screen.getByLabelText("나레이션 톤") as HTMLSelectElement).value).toBe("neutral");
	expect(screen.getByText(/톤 정보 없음/)).toBeTruthy();
	fireEvent.change(screen.getByLabelText("나레이션 톤"), { target: { value: "confident" } });
	expect((screen.getByText("나레이션 생성") as HTMLButtonElement).disabled).toBe(true);
	expect(screen.getByText(/톤 조절에는 로컬/)).toBeTruthy();
	fireEvent.playing(view.container.querySelector("audio")!);
	expect((screen.getByText("영상에 적용") as HTMLButtonElement).disabled).toBe(true);
});

it("restores the saved tone/direction and revokes audition approval on audio failure", async () => {
	const doc = createEmptyDocument({ projectId: "qa", title: "QA" });
	doc.legacyEditor = {
		narration: {
			version: 1,
			jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
			projectId: "qa",
			mode: "preset",
			text: "저장한 대본",
			audioPath: "C:/saved.wav",
			durationSec: 5,
			offsetSec: 2,
			originalGain: 0.4,
			tone: { preset: "bright", direction: "차분하지만 생기 있게" },
			model: "custom-1.7b",
		},
	};
	mock.state.document = doc;
	const view = render(<NarrationDialog open onClose={vi.fn()} />);
	await screen.findByText(/로컬 런타임 구성됨/);
	expect((screen.getByLabelText("나레이션 톤") as HTMLSelectElement).value).toBe("bright");
	expect((screen.getByLabelText(/세부 톤 조절/) as HTMLTextAreaElement).value).toBe(
		"차분하지만 생기 있게",
	);
	fireEvent.playing(view.container.querySelector("audio")!);
	expect((screen.getByText("영상에 적용") as HTMLButtonElement).disabled).toBe(false);
	fireEvent.error(view.container.querySelector("audio")!);
	expect((screen.getByText("영상에 적용") as HTMLButtonElement).disabled).toBe(true);
});
