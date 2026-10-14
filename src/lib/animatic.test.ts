import { describe, expect, it, vi } from "vitest";
import { buildSceneDescription } from "../native/sceneDescription";
import { createEmptyDocument } from "./ai-edition/schema";
import { type AnimaticNative, animaticPosition, createAnimaticDriver } from "./animatic";
import { assembleScenePlan, initialScenePlan } from "./scene-plan";

function fixture() {
	const source = createEmptyDocument({ projectId: "source", title: "Animatic" });
	source.assets.push({
		id: "a",
		kind: "video",
		label: "QA",
		originalPath: "D:/qa.mp4",
		durationSec: 90,
		cameraTrack: null,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
	});
	const plan = initialScenePlan(source);
	plan.scenes[0].outSec = 7;
	plan.scenes[1].inSec = 42;
	plan.scenes[1].outSec = 48;
	plan.scenes[2].inSec = 64;
	plan.scenes[2].outSec = 70;
	plan.scenes[1].caption = "승인한 결정";
	plan.scenes[1].zoom = { scale: 1.5, cx: 0.7, cy: 0.4 };
	return assembleScenePlan(plan, source, "preview");
}
function api() {
	return {
		setCompositorPlaying: vi.fn().mockResolvedValue({ ok: true }),
		setCompositorScene: vi.fn().mockResolvedValue({ ok: true }),
		setCompositorParam: vi.fn().mockResolvedValue({ ok: true }),
		setActiveClip: vi.fn().mockResolvedValue({ ok: true }),
		setCompositorTime: vi.fn().mockResolvedValue({ ok: true }),
	} satisfies AnimaticNative;
}
describe("private animatic transport", () => {
	it("maps cuts and the last frame to the correct source windows", () => {
		const doc = fixture();
		expect(animaticPosition(doc, 7)).toEqual({ index: 1, time: 7, sourceTime: 42 });
		expect(animaticPosition(doc, 13)).toEqual({ index: 2, time: 13, sourceTime: 64 });
		expect(animaticPosition(doc, 999).sourceTime).toBeCloseTo(70 - 1 / 30);
		expect(animaticPosition(doc, NaN).time).toBe(0);
	});
	it("uses the export scene and addressed view only, without modifying the document", async () => {
		const doc = fixture(),
			before = structuredClone(doc),
			native = api(),
			ready = vi.fn(),
			error = vi.fn();
		const driver = createAnimaticDriver(42, doc, ready, error, native);
		driver.seek(10);
		await vi.waitFor(() => expect(ready).toHaveBeenCalled());
		expect(native.setCompositorScene).toHaveBeenCalledWith(
			42,
			JSON.stringify(buildSceneDescription(doc)),
		);
		expect(native.setActiveClip).toHaveBeenLastCalledWith(42, "D:/qa.mp4", "", 0, 1, 45);
		expect(native.setCompositorTime).toHaveBeenLastCalledWith(42, 45);
		expect(native.setCompositorParam.mock.calls.every((c) => c[0] === 42)).toBe(true);
		expect(doc).toEqual(before);
		expect(error).not.toHaveBeenCalled();
		driver.dispose();
	});
	it("coalesces rapid seeks while decoder setup is pending", async () => {
		const native = api(),
			ready = vi.fn();
		let release: ((value: { ok: true }) => void) | undefined;
		native.setActiveClip.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const driver = createAnimaticDriver(8, fixture(), ready, vi.fn(), native);
		driver.seek(0);
		await vi.waitFor(() => expect(release).toBeDefined());
		driver.seek(8);
		driver.seek(16);
		release!({ ok: true });
		await vi.waitFor(() => expect(native.setCompositorTime).toHaveBeenCalledWith(8, 67));
		expect(native.setCompositorTime).toHaveBeenCalledTimes(1);
		expect(native.setActiveClip).toHaveBeenCalledTimes(2);
		driver.dispose();
	});
	it("does not touch a destroyed view after a late configuration response", async () => {
		const native = api(),
			ready = vi.fn(),
			error = vi.fn();
		let release: ((value: { ok: true }) => void) | undefined;
		native.setCompositorScene.mockImplementation(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const driver = createAnimaticDriver(9, fixture(), ready, error, native);
		driver.seek(4);
		await vi.waitFor(() => expect(release).toBeDefined());
		driver.dispose();
		release!({ ok: true });
		await Promise.resolve();
		await Promise.resolve();
		expect(native.setActiveClip).not.toHaveBeenCalled();
		expect(ready).not.toHaveBeenCalled();
		expect(error).not.toHaveBeenCalled();
	});
	it("surfaces a failure once and stops accepting playback requests", async () => {
		const native = api(),
			error = vi.fn();
		native.setCompositorTime.mockRejectedValue(new Error("Decoder failed"));
		const driver = createAnimaticDriver(9, fixture(), vi.fn(), error, native);
		driver.seek(4);
		await vi.waitFor(() => expect(error).toHaveBeenCalledWith("Decoder failed"));
		driver.seek(12);
		expect(native.setCompositorTime).toHaveBeenCalledTimes(1);
		driver.dispose();
	});
});
