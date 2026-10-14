// @vitest-environment jsdom
/**
 * The fatal-error channel (PR #162).
 *
 * `createView` returns an id long before the native render thread can fail, so a host
 * that cannot create a D3D11 device used to leave the user with a black canvas and an
 * `eprintln!` nobody reads. The addon now reports the dead thread through `readFrame`,
 * and this hook turns that into `error`.
 *
 * The half worth guarding is the negative one: `readFrame` also rejects when there is no
 * Electron bridge at all (pure web `npm run dev`, jsdom), and the addon being absent is a
 * normal no-op, not a failure. Neither may raise the banner.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	createCompositorView: vi.fn(),
	readCompositorFrame: vi.fn(),
	destroyCompositorView: vi.fn(),
	setCompositorRect: vi.fn(),
}));

vi.mock("../compositorViewClient", () => ({
	createCompositorView: mocks.createCompositorView,
	readCompositorFrame: mocks.readCompositorFrame,
	destroyCompositorView: mocks.destroyCompositorView,
	setCompositorParam: vi.fn(),
	setCompositorPlaying: vi.fn(),
	setCompositorRect: mocks.setCompositorRect,
}));

import { useNativeCompositorView } from "./useNativeCompositorView";

// jsdom ships no ResizeObserver; the hook constructs one to track the canvas box.
// Nothing here observes anything — these tests only exercise the pull loop.
globalThis.ResizeObserver = class {
	observe() {
		// inert on purpose: the canvas box never changes in these tests
	}
	unobserve() {
		// see observe()
	}
	disconnect() {
		// see observe()
	}
} as unknown as typeof ResizeObserver;

/** A canvas with a stubbed 2D context — jsdom has none, and the pull loop bails without it. */
function stubCanvasRef(): RefObject<HTMLCanvasElement> {
	const canvas = document.createElement("canvas");
	canvas.getContext = vi.fn(() => ({})) as unknown as HTMLCanvasElement["getContext"];
	return { current: canvas };
}

const DEVICE_FAILURE =
	"this display adapter has no D3D11 video decoder (0x887A0004). OpenScreen decodes every preview and export frame with D3D11VA";

describe("useNativeCompositorView", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => vi.unstubAllGlobals());

	it("preserves a paused pixel packet through scroll and pending resize", async () => {
		mocks.createCompositorView.mockResolvedValue({ id: 7 });
		mocks.readCompositorFrame.mockResolvedValue(null).mockResolvedValueOnce({
			gen: 1,
			width: 4,
			height: 2,
			data: new Uint8Array(32),
		});
		const drawImage = vi.fn();
		vi.stubGlobal(
			"ImageData",
			class {
				constructor(..._args: unknown[]) {
					// Canvas drawing is stubbed; only packet dimensions matter here.
				}
			},
		);
		vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ close: vi.fn() }));
		const ref = stubCanvasRef();
		const canvas = ref.current!;
		canvas.getContext = vi.fn(() => ({ drawImage })) as unknown as HTMLCanvasElement["getContext"];
		let width = 100,
			top = 0;
		canvas.getBoundingClientRect = () => new DOMRect(0, top, width, 50);
		const { result, unmount } = renderHook(() => useNativeCompositorView(ref));
		await waitFor(() => {
			expect(drawImage).toHaveBeenCalledOnce();
			expect(result.current.hasFrame).toBe(true);
		});
		for (const nextWidth of [100, 200]) {
			width = nextWidth;
			top += 10;
			const previous = mocks.setCompositorRect.mock.calls.length;
			act(() => window.dispatchEvent(new Event("scroll")));
			await waitFor(() =>
				expect(mocks.setCompositorRect.mock.calls.length).toBeGreaterThan(previous),
			);
			expect([canvas.width, canvas.height]).toEqual([4, 2]);
		}
		expect(drawImage).toHaveBeenCalledOnce();
		unmount();
		expect(mocks.destroyCompositorView).toHaveBeenCalledWith(7);
	});

	it("surfaces the native message when the render thread dies", async () => {
		mocks.createCompositorView.mockResolvedValue({ id: 7 });
		mocks.readCompositorFrame.mockRejectedValue(new Error(DEVICE_FAILURE));

		const ref = stubCanvasRef();
		const { result } = renderHook(() =>
			useNativeCompositorView(ref, { sources: { screenPath: "rec.mp4" } }),
		);

		await waitFor(() => expect(result.current.error).toBe(DEVICE_FAILURE));
	});

	it("stops polling once the error is terminal — the thread never restarts", async () => {
		mocks.createCompositorView.mockResolvedValue({ id: 7 });
		mocks.readCompositorFrame.mockRejectedValue(new Error(DEVICE_FAILURE));

		const ref = stubCanvasRef();
		const { result } = renderHook(() =>
			useNativeCompositorView(ref, { sources: { screenPath: "rec.mp4" } }),
		);

		await waitFor(() => expect(result.current.error).toBe(DEVICE_FAILURE));
		const callsAtFailure = mocks.readCompositorFrame.mock.calls.length;
		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(mocks.readCompositorFrame).toHaveBeenCalledTimes(callsAtFailure);
	});

	it("stays quiet when the addon is absent (synthetic id, no frames, no error)", async () => {
		mocks.createCompositorView.mockResolvedValue({ id: -1 });
		mocks.readCompositorFrame.mockResolvedValue(null);

		const ref = stubCanvasRef();
		const { result } = renderHook(() =>
			useNativeCompositorView(ref, { sources: { screenPath: "rec.mp4" } }),
		);

		await waitFor(() => expect(mocks.readCompositorFrame).toHaveBeenCalled());
		expect(result.current.error).toBeNull();
		expect(result.current.hasFrame).toBe(false);
	});

	it("stays quiet without an Electron bridge — no view id, so nothing is ever polled", async () => {
		mocks.createCompositorView.mockRejectedValue(new Error("Native bridge unavailable."));
		mocks.readCompositorFrame.mockResolvedValue(null);

		const ref = stubCanvasRef();
		const { result } = renderHook(() =>
			useNativeCompositorView(ref, { sources: { screenPath: "rec.mp4" } }),
		);

		await waitFor(() => expect(mocks.createCompositorView).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 120));
		expect(mocks.readCompositorFrame).not.toHaveBeenCalled();
		expect(result.current.error).toBeNull();
	});
});
