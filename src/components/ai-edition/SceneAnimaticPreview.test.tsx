// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "@/lib/ai-edition/schema";
import { initialScenePlan } from "@/lib/scene-plan";
import { SceneAnimaticPreview } from "./SceneAnimaticPreview";

const mocks = vi.hoisted(() => ({
	probe: vi.fn(),
	time: vi.fn(),
	clip: vi.fn(),
	hasFrame: true,
	viewId: 3 as number | null,
}));
vi.mock("@/native/hooks/useNativeCompositorView", () => ({
	useNativeCompositorView: () => ({ viewId: mocks.viewId, error: null, hasFrame: mocks.hasFrame }),
}));
vi.mock("@/native/compositorViewClient", () => ({
	probeCompositorBackend: mocks.probe,
	setCompositorScene: vi.fn().mockResolvedValue({ ok: true }),
	setCompositorPlaying: vi.fn().mockResolvedValue({ ok: true }),
	setCompositorParam: vi.fn().mockResolvedValue({ ok: true }),
	setCompositorTime: mocks.time,
	setActiveClip: mocks.clip,
}));

function fixture() {
	const doc = createEmptyDocument({ projectId: "source", title: "QA" });
	doc.assets.push({
		id: "video",
		kind: "video",
		label: "QA",
		originalPath: "D:/qa.mp4",
		durationSec: 30,
		cameraTrack: null,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
		transcriptionFailure: { kind: "no-audio", message: "Silent" },
	});
	return { source: doc, plan: initialScenePlan(doc) };
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.hasFrame = true;
	mocks.viewId = 3;
	mocks.probe.mockResolvedValue("gpu");
	mocks.time.mockResolvedValue({ ok: true });
	mocks.clip.mockResolvedValue({ ok: true });
});
afterEach(cleanup);
it("waits for actual native frame availability before enabling transport", async () => {
	const data = fixture();
	mocks.hasFrame = false;
	const ui = render(<SceneAnimaticPreview {...data} ko />);
	await waitFor(() => expect(mocks.time).toHaveBeenCalled());
	expect(
		(screen.getByRole("button", { name: "애니매틱 재생" }) as HTMLButtonElement).disabled,
	).toBe(true);
	mocks.hasFrame = true;
	ui.rerender(<SceneAnimaticPreview {...data} ko />);
	expect(
		(screen.getByRole("button", { name: "애니매틱 재생" }) as HTMLButtonElement).disabled,
	).toBe(false);
});
it("seeks to a scene and resets after a plan edit without changing the source", async () => {
	const data = fixture(),
		before = structuredClone(data.source);
	const ui = render(<SceneAnimaticPreview {...data} ko />);
	await waitFor(() =>
		expect((screen.getByRole("button", { name: "2. Scene 2" }) as HTMLButtonElement).disabled).toBe(
			false,
		),
	);
	fireEvent.click(screen.getByRole("button", { name: "2. Scene 2" }));
	await waitFor(() => expect(mocks.clip).toHaveBeenLastCalledWith(3, "D:/qa.mp4", "", 0, 1, 6));
	expect(screen.getByText("6.00 / 18.00s")).toBeTruthy();
	const changed = structuredClone(data.plan);
	changed.scenes[0].outSec = 7;
	ui.rerender(<SceneAnimaticPreview source={data.source} plan={changed} ko />);
	await screen.findByText("0.00 / 19.00s");
	expect(data.source).toEqual(before);
});
it("shows a missing-compositor error instead of a fake source-video preview", async () => {
	mocks.viewId = null;
	mocks.probe.mockResolvedValue("none");
	render(<SceneAnimaticPreview {...fixture()} ko />);
	await screen.findByText(/네이티브 합성기를 사용할 수 없습니다/);
	expect(
		(screen.getByRole("button", { name: "애니매틱 재생" }) as HTMLButtonElement).disabled,
	).toBe(true);
	expect(document.querySelector("video")).toBeNull();
});
it("previews a selected scene in output time and holds its last frame instead of the next cut", async () => {
	const data = fixture();
	render(<SceneAnimaticPreview {...data} ko focusSceneId="scene_2" />);
	await waitFor(() => expect(mocks.time).toHaveBeenCalledWith(3, 6));
	expect(screen.getByText("6.00 / 12.00s")).toBeTruthy();
	expect(screen.queryByRole("button", { name: "3. Scene 3" })).toBeNull();
	fireEvent.change(screen.getByRole("slider", { name: "애니매틱 탐색" }), {
		target: { value: "12" },
	});
	await waitFor(() => expect(mocks.time.mock.calls.at(-1)?.[1]).toBeCloseTo(12 - 1 / 30, 8));
	expect(mocks.clip.mock.calls.every((call) => call[4] === 1)).toBe(true);
});
