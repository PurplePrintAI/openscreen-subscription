export type ModelContextWindowSource = "runtime" | "official";

export interface ModelContextWindow {
	tokens: number;
	source: ModelContextWindowSource;
}

const ONE_MILLION = 1_000_000;
const ONE_POINT_ZERO_FIVE_MILLION = 1_050_000;
const STANDARD_CLAUDE_WINDOW = 200_000;

function normalizedModel(value: string | undefined): string {
	return (value ?? "").trim().toLowerCase();
}

/** Current Codex catalog models whose context windows are published by OpenAI. */
export function resolveCodexContextWindow(model: string): ModelContextWindow | undefined {
	const id = normalizedModel(model);
	if (["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"].includes(id))
		return { tokens: ONE_POINT_ZERO_FIVE_MILLION, source: "official" };
	if (/^gpt-5\.6(?:-(?:sol|terra|luna))?(?:-\d{4}-\d{2}-\d{2})?$/.test(id))
		return { tokens: ONE_POINT_ZERO_FIVE_MILLION, source: "official" };
	if (/^gpt-5\.5(?:-\d{4}-\d{2}-\d{2})?$/.test(id))
		return { tokens: ONE_POINT_ZERO_FIVE_MILLION, source: "official" };
	if (/^gpt-5\.4(?:-\d{4}-\d{2}-\d{2})?$/.test(id))
		return { tokens: ONE_POINT_ZERO_FIVE_MILLION, source: "official" };
	if (/^gpt-5\.4-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(id))
		return { tokens: 400_000, source: "official" };
	if (id === "gpt-5.3-codex-spark") return { tokens: 128_000, source: "official" };
	if (/^gpt-4o(?:-mini)?(?:-\d{4}-\d{2}-\d{2})?$/.test(id))
		return { tokens: 128_000, source: "official" };
	return undefined;
}

export interface ClaudeContextWindowInput {
	id: string;
	resolvedModel?: string;
	description?: string;
	disableOneMillion?: boolean;
	usesGateway?: boolean;
}

/**
 * Resolve only context windows that the CLI selection or current official model
 * specification makes unambiguous. Custom IDs remain unknown.
 */
export function resolveClaudeContextWindow(
	input: ClaudeContextWindowInput,
): ModelContextWindow | undefined {
	const id = normalizedModel(input.id);
	const resolved = normalizedModel(input.resolvedModel);
	const description = normalizedModel(input.description);
	const combined = `${id} ${resolved} ${description}`;
	const recognized = /(?:claude-)?(?:fable-5|opus-(?:5|4-8)|sonnet-5|haiku-4-5)/.test(combined);
	if (!recognized) return undefined;
	if (input.disableOneMillion) return { tokens: STANDARD_CLAUDE_WINDOW, source: "runtime" };
	if (/\[1m\]|1m context|1 million/.test(combined))
		return { tokens: ONE_MILLION, source: "runtime" };
	if (/(?:claude-)?haiku-4-5/.test(combined))
		return { tokens: STANDARD_CLAUDE_WINDOW, source: "official" };
	if (input.usesGateway) return { tokens: STANDARD_CLAUDE_WINDOW, source: "runtime" };
	return { tokens: ONE_MILLION, source: "official" };
}

export function formatContextWindow(tokens: number): string {
	if (tokens >= 1_000_000) {
		const millions = tokens / 1_000_000;
		return `${Number.isInteger(millions) ? millions : millions.toFixed(2)}M`;
	}
	if (tokens >= 1_000 && Number.isInteger(tokens / 1_000)) return `${tokens / 1_000}K`;
	return tokens.toLocaleString();
}

/** Official API-provider fallbacks; local runtimes add environment-aware metadata themselves. */
export function resolveConfiguredContextWindow(config: {
	provider: string;
	model: string;
	baseUrl?: string;
}): ModelContextWindow | undefined {
	if (config.provider === "codex-subscription") return resolveCodexContextWindow(config.model);
	if (config.provider === "openai") {
		const baseUrl = normalizedModel(config.baseUrl);
		if (baseUrl && !baseUrl.startsWith("https://api.openai.com/")) return undefined;
		return resolveCodexContextWindow(config.model);
	}
	if (config.provider === "anthropic") {
		const baseUrl = normalizedModel(config.baseUrl);
		if (baseUrl && !baseUrl.startsWith("https://api.anthropic.com")) return undefined;
		return resolveClaudeContextWindow({ id: config.model });
	}
	return undefined;
}
