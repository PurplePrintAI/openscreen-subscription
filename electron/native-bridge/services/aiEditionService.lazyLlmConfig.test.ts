import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmConfigStore } from "../../ai-edition/llm-config-store";
import { AiEditionService, type AiEditionServiceOptions } from "./aiEditionService";

const runtime = vi.hoisted(() => ({
	status: vi.fn(async () => ({ available: true, connected: true, plan: "plus" })),
	logout: vi.fn(async () => undefined),
	models: vi.fn(async () => ["account-model"]),
}));
vi.mock("../../ai-edition/codex/app-server", () => ({ getCodexAppServer: async () => runtime }));
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
		});
	});

	it("rejects unknown subscription providers without invoking the runtime", async () => {
		const { service } = serviceWithCountingFactory();
		expect(await service.llmSubscriptionLogin("openai-oauth")).toMatchObject({ success: false });
		expect(runtime.status).not.toHaveBeenCalled();
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
