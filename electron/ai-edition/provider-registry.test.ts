// Guards the 1.8.0 provider removal. `openai-oauth` and `copilot-proxy` reached
// a user's subscription by presenting GitHub's and OpenAI's own OAuth client IDs
// and an editor User-Agent against first-party-only endpoints, inside a signed
// installer. They come back on the Copilot SDK / `codex app-server` instead.
//
// This is a lint, not a unit test: it fails if someone re-adds a provider that
// points at one of those endpoints, or an auth kind the app no longer implements.

import { describe, expect, it } from "vitest";
import {
	GPT6_MODELS,
	getReasoningEffortOptions,
	gpt6ModelOrder,
	PROVIDER_DEFINITIONS,
	reasoningEffortForModel,
} from "./provider-registry";

const FIRST_PARTY_ONLY_HOSTS = [
	"chatgpt.com/backend-api",
	"copilot_internal",
	"githubcopilot.com",
	"api.individual.githubcopilot.com",
];

describe("PROVIDER_DEFINITIONS", () => {
	it("prefers the three official GPT-6 models without inventing account access", () => {
		expect(GPT6_MODELS.map((model) => model.id)).toEqual([
			"gpt-6-sol",
			"gpt-6-astra",
			"gpt-6-luna",
		]);
		expect(PROVIDER_DEFINITIONS.find((provider) => provider.id === "openai")?.defaultModel).toBe(
			"gpt-6-sol",
		);
		expect(gpt6ModelOrder("gpt-6-astra")).toBeLessThan(gpt6ModelOrder("gpt-4o"));
	});

	it("does not offer unsupported no-reasoning mode for GPT-6 Astra", () => {
		expect(getReasoningEffortOptions("openai", "gpt-6-astra")).toEqual([
			"low",
			"medium",
			"high",
			"xhigh",
		]);
		expect(reasoningEffortForModel("openai", "gpt-6-astra", "none")).toBe("low");
		expect(reasoningEffortForModel("openai", "gpt-6-astra")).toBe("low");
		expect(reasoningEffortForModel("openai", "gpt-6-sol", "none")).toBe("none");
		expect(reasoningEffortForModel("openai", "gpt-6-luna")).toBe("medium");
		expect(getReasoningEffortOptions("openai", "gpt-6-sol")).toEqual([
			"none",
			"low",
			"medium",
			"high",
			"xhigh",
		]);
	});
	it("routes subscriptions only through the implemented official local runtime", () => {
		const others = PROVIDER_DEFINITIONS.filter((def) => def.authKind !== "api-key");
		expect(others.map((d) => d.id)).toEqual(["codex-subscription", "claude-local"]);
		expect(others[0].baseUrl).toBeUndefined();
		expect(others[0].envKeys).toEqual([]);
	});

	it("points at no endpoint reserved for a vendor's own clients", () => {
		const offenders = PROVIDER_DEFINITIONS.filter((def) =>
			FIRST_PARTY_ONLY_HOSTS.some((host) => def.baseUrl?.includes(host)),
		);
		expect(offenders.map((d) => `${d.id} -> ${d.baseUrl}`)).toEqual([]);
	});

	it("no longer defines the two removed providers", () => {
		const ids = PROVIDER_DEFINITIONS.map((def) => def.id);
		expect(ids).not.toContain("openai-oauth");
		expect(ids).not.toContain("copilot-proxy");
	});
});
