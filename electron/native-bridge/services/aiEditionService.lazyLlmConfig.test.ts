import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmConfigStore } from "../../ai-edition/llm-config-store";
import { AiEditionService, type AiEditionServiceOptions } from "./aiEditionService";

const runtime = vi.hoisted(() => ({
	status: vi.fn(async () => ({ available: true, connected: true, plan: "plus" })),
	generateImage: vi.fn(async (_prompt: string): Promise<never> => {
		throw new Error("Codex subscription unavailable");
	}),
	logout: vi.fn(async () => undefined),
	models: vi.fn(async () => [
		{
			id: "account-model",
			label: "Account model",
			contextWindowTokens: 1_050_000,
			contextWindowSource: "official" as const,
		},
	]),
}));
vi.mock("../../ai-edition/codex/app-server", () => ({ getCodexAppServer: async () => runtime }));
const claudeRuntime = vi.hoisted(() => ({
	models: vi.fn(async () => [
		{
			id: "claude-opus-4-8[1m]",
			label: "Opus 4.8 (1M context)",
			resolvedModel: "claude-opus-4-8[1m]",
			contextWindowTokens: 1_000_000,
			contextWindowSource: "runtime" as const,
		},
	]),
	status: vi.fn(async () => ({
		available: true,
		connected: true,
		billing: "subscription",
		plan: "max",
	})),
}));
vi.mock("../../ai-edition/claude/cli", () => ({
	getClaudeCli: async () => claudeRuntime,
}));
beforeEach(() => {
	vi.clearAllMocks();
});

/**
 * `LlmConfigStore`'s constructor does two sync readFileSync plus a `safeStorage`
 * decrypt. On macOS that decrypt is backed by a Keychain item, so building the
 * store during startup made every launch prompt for Keychain access — including
 * for the majority of users who never open the AI layer at all.
 *
 * The fix is that `AiEditionServiceOptions.llmConfig` is a factory the service
 * calls on first use, and `registerNativeBridgeHandlers` passes it uncalled.
 * That is a startup-timing property: reintroducing the eager form (a stray `()`
 * at the wiring site) breaks nothing that any other test observes, the app still
 * works, and the only symptom is a Keychain prompt on a machine the author may
 * not have. Hence a test that asserts on *when* the factory runs.
 */

/** Enough of the store for the methods exercised here; unused members stay absent. */
function storeStub(): LlmConfigStore {
	return {
		getConfig: () => null,
		getCredential: () => null,
	} as unknown as LlmConfigStore;
}

function serviceWithCountingFactory(): { service: AiEditionService; builds: () => number } {
	let builds = 0;
	const store = storeStub();
	const options = {
		documents: {
			listProjects: async () => [],
		},
		llmConfig: () => {
			builds += 1;
			return store;
		},
	} as unknown as AiEditionServiceOptions;
	return { service: new AiEditionService(options), builds: () => builds };
}

describe("AiEditionService — LLM store resolution is deferred", () => {
	it("puts available GPT-6 API models first with verified labels and context", async () => {
		const store = {
			getConfig: () => ({
				provider: "openai",
				model: "gpt-6-sol",
				baseUrl: "https://api.openai.com/v1/",
			}),
			getCredential: () => ({ value: "test-key" }),
		} as unknown as LlmConfigStore;
		const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(
			new Response(
				JSON.stringify({
					data: [
						{ id: "gpt-4o" },
						{ id: "gpt-6-luna" },
						{ id: "gpt-6-astra" },
						{ id: "gpt-6-sol" },
					],
				}),
				{ status: 200 },
			),
		);
		try {
			const service = new AiEditionService({
				llmConfig: () => store,
			} as unknown as AiEditionServiceOptions);
			const result = await service.llmListProviderModels("openai");
			expect(result.models).toEqual(["gpt-6-sol", "gpt-6-astra", "gpt-6-luna", "gpt-4o"]);
			expect(result.catalog).toEqual([
				{
					id: "gpt-6-sol",
					label: "GPT-6 Sol",
					contextWindowTokens: 1_050_000,
					contextWindowSource: "official",
				},
				{
					id: "gpt-6-astra",
					label: "GPT-6 Astra",
					contextWindowTokens: 1_050_000,
					contextWindowSource: "official",
				},
				{
					id: "gpt-6-luna",
					label: "GPT-6 Luna",
					contextWindowTokens: 1_050_000,
					contextWindowSource: "official",
				},
			]);
			expect(fetch).toHaveBeenCalledWith("https://api.openai.com/v1/models", expect.any(Object));
		} finally {
			fetch.mockRestore();
		}
	});

	it("reads local CLI readiness without collecting credentials or offering an app login", async () => {
		const { service } = serviceWithCountingFactory();
		const snapshot = await service.llmGetSnapshot();
		expect(snapshot.connectedProviders).toContain("claude-local");
		expect(snapshot.subscriptions?.["claude-local"]).toMatchObject({
			plan: "max",
			billing: "subscription",
		});
		expect(await service.llmSetApiKey("claude-local", "never-store-this")).toMatchObject({
			success: false,
		});
		expect(await service.llmSubscriptionLogin("claude-local")).toMatchObject({ success: false });
		await service.llmSubscriptionStatus("claude-local");
		expect(claudeRuntime.status).toHaveBeenLastCalledWith(true);
		expect(await service.llmListProviderModels("claude-local")).toEqual({
			models: ["claude-opus-4-8[1m]"],
			catalog: [
				{
					id: "claude-opus-4-8[1m]",
					label: "Opus 4.8 (1M context)",
					resolvedModel: "claude-opus-4-8[1m]",
					contextWindowTokens: 1_000_000,
					contextWindowSource: "runtime",
				},
			],
		});
	});

	it("deselects the shared CLI without logging out any account", async () => {
		const setConfig = vi.fn(async () => undefined);
		const removeCredential = vi.fn(async () => undefined);
		const store = {
			getConfig: () => ({ provider: "claude-local", model: "sonnet" }),
			getCredential: () => null,
			setConfig,
			removeCredential,
		};
		const service = new AiEditionService({
			llmConfig: () => store,
		} as unknown as AiEditionServiceOptions);
		await service.llmDisconnect("claude-local");
		expect(setConfig).toHaveBeenCalledWith({ provider: "", model: "" });
		expect(runtime.logout).not.toHaveBeenCalled();
	});

	it("refuses selecting an unauthenticated CLI", async () => {
		const { service } = serviceWithCountingFactory();
		claudeRuntime.status.mockResolvedValueOnce({
			available: true,
			connected: false,
			billing: "runtime",
			plan: "",
		});
		expect(await service.llmSetConfig({ provider: "claude-local", model: "sonnet" })).toMatchObject(
			{ success: false },
		);
	});
	it("uses the saved context reference on both usage routes without changing the native token estimate", () => {
		const store = { getConfig: () => ({ contextBudgetTokens: 200_000 }) } as LlmConfigStore;
		const getContextUsage = vi.fn(() => ({
			usedTokens: 20_000,
			budgetTokens: 80_000,
			ratio: 0.25,
			fillPercent: 25,
		}));
		const service = new AiEditionService({
			llmConfig: () => store,
			getContextUsage,
		} as unknown as AiEditionServiceOptions);
		expect(service.chatBudget("p", "s")).toEqual({
			usedTokens: 20_000,
			budgetTokens: 200_000,
			ratio: 0.1,
			fillPercent: 10,
		});
		expect(service.chatContextUsage("p", "s")).toEqual(service.chatBudget("p", "s"));
	});
	it("reports subscription readiness from the official runtime, without an API credential", async () => {
		const { service } = serviceWithCountingFactory();
		const snapshot = await service.llmGetSnapshot();
		expect(snapshot.connectedProviders).toContain("codex-subscription");
		expect(snapshot.subscriptions?.["codex-subscription"]).toMatchObject({
			connected: true,
			plan: "plus",
		});
		expect(await service.llmSetApiKey("codex-subscription", "not-a-subscription")).toMatchObject({
			success: false,
		});
		expect(await service.llmListProviderModels("codex-subscription")).toEqual({
			models: ["account-model"],
			catalog: [
				{
					id: "account-model",
					label: "Account model",
					contextWindowTokens: 1_050_000,
					contextWindowSource: "official",
				},
			],
		});
	});

	it("rejects unknown subscription providers without invoking the runtime", async () => {
		const { service } = serviceWithCountingFactory();
		expect(await service.llmSubscriptionLogin("openai-oauth")).toMatchObject({ success: false });
		expect(runtime.status).not.toHaveBeenCalled();
	});

	it("routes image generation to the subscription without changing the active chat provider", async () => {
		const getProject = vi.fn(async () => ({}));
		const llmConfig = vi.fn(() => {
			throw new Error("Image generation must not read the active chat config.");
		});
		const service = new AiEditionService({
			llmConfig,
			documents: { getProject },
			selectSession: () => ({ id: "s", projectId: "p", messages: [] }),
		} as unknown as AiEditionServiceOptions);
		await expect(service.generateImageScene("p", "s", "a sphere")).rejects.toThrow(
			"Codex subscription unavailable",
		);
		expect(getProject).toHaveBeenCalledExactlyOnceWith("p");
		expect(runtime.generateImage).toHaveBeenCalledExactlyOnceWith("a sphere");
		expect(llmConfig).not.toHaveBeenCalled();
	});
	it("does not build the store while the service is constructed", () => {
		const { builds } = serviceWithCountingFactory();
		expect(builds()).toBe(0);
	});

	it("does not build the store for work that has nothing to do with the LLM", async () => {
		const { service, builds } = serviceWithCountingFactory();
		await service.listProjects();
		expect(builds()).toBe(0);
	});

	it("builds it once on the first call that needs it, and holds it after", async () => {
		const { service, builds } = serviceWithCountingFactory();

		// llmGetSnapshot reads the store once per provider definition, so this
		// also pins the memoisation: without it the factory ran nine times here.
		await service.llmGetSnapshot();
		expect(builds()).toBe(1);

		await service.llmGetSnapshot();
		expect(builds()).toBe(1);
	});
});
