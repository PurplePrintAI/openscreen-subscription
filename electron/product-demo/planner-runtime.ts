import type { LlmConfig } from "../ai-edition/llm-config-store";
import { DEMO_PLANNER_PROMPT, type DemoPlanner, readDemoPlan } from "./plan";

export function subscriptionDemoPlanner(getConfig: () => LlmConfig | null): DemoPlanner {
	return async (brief, page, signal) => {
		const config = getConfig();
		if (!config || !["codex-subscription", "claude-local"].includes(config.provider)) {
			throw new Error(
				"Select a connected Codex or Claude local subscription in AI settings for this preview feature.",
			);
		}
		const runtime =
			config.provider === "claude-local"
				? await (await import("../ai-edition/claude/cli")).getClaudeCli()
				: await (await import("../ai-edition/codex/app-server")).getCodexAppServer();
		const result = await runtime.run({
			model: config.model,
			effort: config.reasoningEffort,
			instructions: DEMO_PLANNER_PROMPT,
			input: JSON.stringify({ brief, untrustedPage: page }),
			signal,
		});
		return readDemoPlan(result, brief, page);
	};
}
