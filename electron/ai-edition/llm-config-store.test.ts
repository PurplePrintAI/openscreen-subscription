import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveContextBudget } from "../../src/lib/ai-edition/contextBudget";
import { LlmConfigStore } from "./llm-config-store";

vi.mock("electron", () => ({ safeStorage: { isEncryptionAvailable: () => false } }));
let dir: string;
beforeEach(async () => {
	dir = await fs.mkdtemp(path.join(os.tmpdir(), "openscreen-config-test-"));
});
afterEach(async () => {
	await fs.rm(path.join(dir, "llm-config.json"), { force: true });
	await fs.rmdir(dir);
});

describe("context reference persistence", () => {
	it("keeps old configs compatible and persists a custom reference across reloads", async () => {
		const config = { provider: "openai", model: "test-model", reasoningEffort: "medium" };
		await fs.writeFile(path.join(dir, "llm-config.json"), JSON.stringify(config));
		const store = new LlmConfigStore(dir);
		expect(resolveContextBudget(store.getConfig()?.contextBudgetTokens)).toBe(80_000);
		await store.setConfig({ ...config, contextBudgetTokens: 256_000 });
		expect(new LlmConfigStore(dir).getConfig()).toEqual({
			...config,
			contextBudgetTokens: 256_000,
		});
	});

	it.each([
		0,
		-1,
		999,
		1000.5,
		2_000_001,
		Number.NaN,
		Number.POSITIVE_INFINITY,
	])("rejects %s without replacing the saved config", async (value) => {
		const store = new LlmConfigStore(dir);
		const valid = { provider: "openai", model: "test-model", contextBudgetTokens: 128_000 };
		await store.setConfig(valid);
		await expect(store.setConfig({ ...valid, contextBudgetTokens: value })).rejects.toThrow(
			"Context reference",
		);
		expect(store.getConfig()).toEqual(valid);
		expect(new LlmConfigStore(dir).getConfig()).toEqual(valid);
	});
});
