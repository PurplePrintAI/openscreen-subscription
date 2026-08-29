import { describe, expect, it } from "vitest";
import {
	formatContextWindow,
	resolveClaudeContextWindow,
	resolveCodexContextWindow,
	resolveConfiguredContextWindow,
} from "./modelContextWindow";

describe("model context window metadata", () => {
	it.each([
		["gpt-5.6-sol", 1_050_000],
		["gpt-5.6-terra", 1_050_000],
		["gpt-5.5", 1_050_000],
		["gpt-5.4", 1_050_000],
		["gpt-5.4-mini", 400_000],
		["gpt-5.3-codex-spark", 128_000],
	])("resolves the current official Codex spec for %s", (model, tokens) => {
		expect(resolveCodexContextWindow(model)).toEqual({ tokens, source: "official" });
	});

	it("does not invent a context window for an unknown Codex model", () => {
		expect(resolveCodexContextWindow("private-codex-deployment")).toBeUndefined();
	});

	it("uses explicit Claude CLI context variants before model-family defaults", () => {
		expect(
			resolveClaudeContextWindow({
				id: "opus[1m]",
				resolvedModel: "claude-opus-5[1m]",
			}),
		).toEqual({ tokens: 1_000_000, source: "runtime" });
	});

	it("accounts for direct, gateway, disabled-1M, and unknown Claude configurations", () => {
		expect(resolveClaudeContextWindow({ id: "sonnet", resolvedModel: "claude-sonnet-5" })).toEqual({
			tokens: 1_000_000,
			source: "official",
		});
		expect(
			resolveClaudeContextWindow({
				id: "sonnet",
				resolvedModel: "claude-sonnet-5",
				usesGateway: true,
			}),
		).toEqual({ tokens: 200_000, source: "runtime" });
		expect(
			resolveClaudeContextWindow({
				id: "sonnet",
				resolvedModel: "claude-sonnet-5",
				disableOneMillion: true,
			}),
		).toEqual({ tokens: 200_000, source: "runtime" });
		expect(resolveClaudeContextWindow({ id: "my-deployment" })).toBeUndefined();
	});

	it("formats compact context-window labels without rounding 1.05M to 1M", () => {
		expect(formatContextWindow(1_050_000)).toBe("1.05M");
		expect(formatContextWindow(1_000_000)).toBe("1M");
		expect(formatContextWindow(400_000)).toBe("400K");
	});

	it("uses official API fallbacks only for first-party endpoints", () => {
		expect(resolveConfiguredContextWindow({ provider: "openai", model: "gpt-4o" })).toEqual({
			tokens: 128_000,
			source: "official",
		});
		expect(
			resolveConfiguredContextWindow({
				provider: "openai",
				model: "gpt-5.6-sol",
				baseUrl: "https://gateway.example/v1",
			}),
		).toBeUndefined();
		expect(
			resolveConfiguredContextWindow({ provider: "anthropic", model: "claude-haiku-4-5" }),
		).toEqual({ tokens: 200_000, source: "official" });
	});
});
