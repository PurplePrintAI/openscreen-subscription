import { afterEach, expect, it, vi } from "vitest";
import { createEmptyDocument } from "../../src/lib/ai-edition/schema";
import { initialScenePlan } from "../../src/lib/scene-plan";
import type { PlannerRequest } from "../../src/lib/scene-planner";
import type { LlmConfigStore } from "../ai-edition/llm-config-store";
import { PLANNER_PROMPT, ScenePlannerService } from "./service";

vi.mock("../ai-edition/deep-agent/chat-model", () => ({
	createOpenScreenChatModel: vi.fn(),
	messageContentToText: (v: unknown) => String(v),
}));
function fixture() {
	const config = { provider: "claude-local", model: "sonnet", allowAgentEdits: false };
	const store = { getConfig: () => config, getCredential: () => null } as unknown as LlmConfigStore;
	const doc = createEmptyDocument({ projectId: "qa", title: "Product" });
	doc.assets.push({
		id: "v",
		kind: "video",
		label: "Demo",
		originalPath: "D:/private.mp4",
		durationSec: 30,
		video: { width: 1920, height: 1080, fps: 30, codec: "h264" },
		cameraTrack: null,
	});
	const plan = initialScenePlan(doc);
	const output = JSON.stringify({
		summary: "문제에서 결과까지",
		plan,
		missingMaterials: ["화면 미확인"],
		sceneNotes: plan.scenes.map((s) => ({ sceneId: s.id, basis: "metadata", reason: "확인 필요" })),
	});
	const request: Extract<PlannerRequest, { action: "generate" }> = {
		action: "generate",
		requestId: "00000000-0000-4000-8000-000000000001",
		consent: true,
		routeKey: JSON.stringify([config.provider, config.model, "", ""]),
		document: doc,
		currentPlan: plan,
		brief: { request: "제품 소개", maxDurationSec: 20, includeTranscript: false },
	};
	return { store, config, request, output };
}
afterEach(() => vi.useRealTimers());
it("calls the existing route once with projected text, without editor tools or document writes", async () => {
	const { store, request, output } = fixture(),
		invoke = vi.fn().mockResolvedValue(output);
	const before = structuredClone(request.document);
	const service = new ScenePlannerService(() => store, invoke);
	const reply = await service.handle(request);
	expect(reply.kind).toBe("proposal");
	expect(invoke).toHaveBeenCalledOnce();
	expect(invoke.mock.calls[0][1]).not.toContain("D:/private.mp4");
	expect(invoke.mock.calls[0][0]).toMatchObject({ provider: "claude-local", model: "sonnet" });
	expect(invoke.mock.calls[0][2]).toBeInstanceOf(AbortSignal);
	expect(request.document).toEqual(before);
	expect(PLANNER_PROMPT).toContain("NO tools");
});
it("rejects changed route or absent consent before invoking the model", async () => {
	const { store, request, output, config } = fixture(),
		invoke = vi.fn().mockResolvedValue(output);
	const service = new ScenePlannerService(() => store, invoke);
	await expect(
		service.handle({ ...request, consent: false } as unknown as PlannerRequest),
	).rejects.toThrow();
	config.model = "opus";
	await expect(service.handle(request)).rejects.toThrow(/configuration changed/);
	expect(invoke).not.toHaveBeenCalled();
});
it("reports malformed output and provider failure without resubmission", async () => {
	const { store, request } = fixture(),
		invoke = vi.fn().mockResolvedValue("not JSON");
	const service = new ScenePlannerService(() => store, invoke);
	await expect(service.handle(request)).rejects.toThrow();
	expect(invoke).toHaveBeenCalledOnce();
	invoke.mockRejectedValue(new Error("Provider unavailable"));
	await expect(service.handle(request)).rejects.toThrow(/Provider unavailable/);
	expect(invoke).toHaveBeenCalledTimes(2);
});
it("blocks duplicate requests, cancels only the matching ID, and ignores late completion", async () => {
	const { store, request, output } = fixture();
	let finish: (value: string) => void = () => undefined;
	const invoke = vi.fn(
		(_config: unknown, _input: string, _signal: AbortSignal) =>
			new Promise<string>((resolve) => {
				finish = resolve;
			}),
	);
	const service = new ScenePlannerService(() => store, invoke);
	const pending = service.handle(request);
	const rejected = expect(pending).rejects.toThrow(/cancelled/);
	await expect(service.handle(request)).rejects.toThrow(/already running/);
	service.cancel("wrong-id");
	expect(invoke.mock.calls[0][2]?.aborted).not.toBe(true);
	service.cancel(request.requestId);
	await rejected;
	finish(output);
	expect(invoke).toHaveBeenCalledOnce();
});
it("times out an unresponsive provider and aborts the request", async () => {
	vi.useFakeTimers();
	const { store, request } = fixture();
	const invoke = vi.fn(
		(_config: unknown, _input: string, signal: AbortSignal) =>
			new Promise<string>(() => {
				expect(signal.aborted).toBe(false);
			}),
	);
	const service = new ScenePlannerService(() => store, invoke, 50);
	const pending = expect(service.handle(request)).rejects.toThrow(/timed out/);
	await vi.advanceTimersByTimeAsync(51);
	await pending;
	expect(invoke.mock.calls[0][2].aborted).toBe(true);
});
