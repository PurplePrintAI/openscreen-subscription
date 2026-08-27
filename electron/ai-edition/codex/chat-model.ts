import {
	BaseChatModel,
	type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { getCodexAppServer } from "./app-server";

/** Text-only callers (caption translation and compaction). The editor uses dynamic tools directly. */
export class CodexChatModel extends BaseChatModel {
	constructor(
		private readonly model: string,
		private readonly effort?: string,
	) {
		super({});
	}
	_llmType(): string {
		return "codex-subscription";
	}
	async _generate(messages: BaseMessage[], options: BaseChatModelCallOptions): Promise<ChatResult> {
		const system = messages
			.filter((message) => message.getType() === "system")
			.map((message) => String(message.content))
			.join("\n\n");
		const conversation = messages
			.filter((message) => message.getType() !== "system")
			.map((message) => ({ role: message.getType(), content: message.content }));
		const runtime = await getCodexAppServer();
		const text = await runtime.run({
			model: this.model,
			effort: this.effort,
			instructions: system,
			input: JSON.stringify(conversation),
			signal: options.signal,
		});
		return { generations: [{ text, message: new AIMessage(text) }] };
	}
}
