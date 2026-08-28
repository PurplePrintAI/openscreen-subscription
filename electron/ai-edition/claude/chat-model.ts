import {
	BaseChatModel,
	type BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { ChatResult } from "@langchain/core/outputs";
import { getClaudeCli } from "./cli";

/** Caption translation and manual compaction use the same user-owned CLI without tools. */
export class ClaudeChatModel extends BaseChatModel {
	constructor(
		private readonly model: string,
		private readonly effort?: string,
	) {
		super({});
	}
	_llmType(): string {
		return "claude-local";
	}
	async _generate(messages: BaseMessage[], options: BaseChatModelCallOptions): Promise<ChatResult> {
		const instructions = messages
			.filter((message) => message.getType() === "system")
			.map((message) => String(message.content))
			.join("\n\n");
		const conversation = messages
			.filter((message) => message.getType() !== "system")
			.map((message) => ({ role: message.getType(), content: message.content }));
		const text = await (await getClaudeCli()).run({
			model: this.model,
			effort: this.effort,
			instructions,
			input: JSON.stringify(conversation),
			signal: options.signal,
		});
		return { generations: [{ text, message: new AIMessage(text) }] };
	}
}
