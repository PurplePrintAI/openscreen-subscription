/** Provider-neutral output; image bytes must remain images, never JSON prose. */
export type EditorToolContent =
	| { type: "text"; text: string }
	| { type: "image"; data: string; mimeType: "image/jpeg" | "image/png" };

export type EditorToolOutput = string | { content: EditorToolContent[]; isError?: boolean };

export interface EditorRuntimeTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	invoke: (args: Record<string, unknown>) => Promise<EditorToolOutput>;
}

export function codexToolContent(output: EditorToolOutput) {
	const content =
		typeof output === "string" ? [{ type: "text" as const, text: output }] : output.content;
	return content.map((item) =>
		item.type === "text"
			? { type: "inputText" as const, text: item.text }
			: { type: "inputImage" as const, imageUrl: `data:${item.mimeType};base64,${item.data}` },
	);
}

export function toolOutputSucceeded(output: EditorToolOutput): boolean {
	if (typeof output !== "string") return output.isError !== true;
	try {
		const value = JSON.parse(output);
		return !value?.error && value?.ok !== false;
	} catch {
		return false;
	}
}
