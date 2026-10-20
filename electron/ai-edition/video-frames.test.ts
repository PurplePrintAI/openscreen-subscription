import { describe, expect, it, vi } from "vitest";
import { createEmptyDocument, documentSchema } from "../../src/lib/ai-edition/schema";
import { createVideoFrameTool, type VideoFrameReader, videoFrameToolForApi } from "./video-frames";

function fixture() {
	const base = createEmptyDocument({ projectId: "qa", title: "Frames" });
	const holder = {
		current: documentSchema.parse({
			...base,
			assets: [
				{
					id: "asset",
					kind: "video",
					label: "Demo",
					originalPath: "/private/demo.mp4",
					durationSec: 10,
				},
			],
			timeline: {
				...base.timeline,
				clips: [
					{
						id: "clip",
						assetId: "asset",
						sourceStartSec: 2,
						sourceEndSec: 8,
						timelineStartSec: 12,
						timelineEndSec: 18,
						wordRefs: [],
						origin: "user",
						reason: "",
					},
				],
				trimRanges: [
					{
						id: "cut",
						assetId: "asset",
						clipId: "clip",
						startSec: 3,
						endSec: 4,
						origin: "user",
						reason: "",
					},
				],
			},
		}),
	};
	const read = vi.fn(async (_input: Parameters<VideoFrameReader["read"]>[0]) => ({
		mimeType: "image/jpeg" as const,
		data: "/9j/2Q==",
	}));
	const sink = { toolStart: vi.fn(), toolEnd: vi.fn() };
	return { holder, read, sink, tool: createVideoFrameTool(holder, { read }, sink) };
}

describe("bounded video inspection", () => {
	it.each([
		"anthropic",
		"openai-responses",
	] as const)("preserves images through the installed %s serializer", async (format) => {
		const f = fixture();
		const apiTool = videoFrameToolForApi(f.tool, format);
		const result = await apiTool.invoke({
			type: "tool_call",
			id: "frame-call",
			name: "inspectVideoFrames",
			args: { assetId: "asset", sourceTimesSec: [2] },
		});
		const require = createRequire(import.meta.url);
		if (format === "openai-responses") {
			const file = path.join(
				path.dirname(require.resolve("@langchain/openai/package.json")),
				"dist/converters/responses.js",
			);
			const converter = (await import(pathToFileURL(file).href)) as {
				convertMessagesToResponsesInput(input: {
					messages: unknown[];
					model: string;
					zdrEnabled: boolean;
				}): unknown;
			};
			expect(
				converter.convertMessagesToResponsesInput({
					messages: [result],
					model: "gpt-6-sol",
					zdrEnabled: false,
				}),
			).toMatchObject([
				{
					type: "function_call_output",
					output: [
						{ type: "input_text" },
						{ type: "input_image", image_url: "data:image/jpeg;base64,/9j/2Q==" },
					],
				},
			]);
		} else {
			const file = path.join(
				path.dirname(require.resolve("@langchain/anthropic/package.json")),
				"dist/utils/message_inputs.js",
			);
			const converter = (await import(pathToFileURL(file).href)) as {
				_convertMessagesToAnthropicPayload(messages: unknown[]): unknown;
			};
			expect(converter._convertMessagesToAnthropicPayload([result])).toMatchObject({
				messages: [
					{
						content: [
							{
								type: "tool_result",
								content: [
									{ type: "text" },
									{
										type: "image",
										source: { type: "base64", media_type: "image/jpeg", data: "/9j/2Q==" },
									},
								],
							},
						],
					},
				],
			});
		}
	});
	it("returns images with source-to-ruler evidence without mutating the project or exposing paths", async () => {
		const f = fixture();
		const before = JSON.stringify(f.holder.current);
		const result = await f.tool.invoke({ assetId: "asset", sourceTimesSec: [3, 5] });
		expect(typeof result).not.toBe("string");
		if (typeof result === "string") throw new Error("Expected images");
		expect(result.content.filter((item) => item.type === "image")).toHaveLength(2);
		const first = result.content[0];
		if (first.type !== "text") throw new Error("Expected frame metadata");
		expect(JSON.parse(first.text).timelinePositions).toEqual([
			{
				clipId: "clip",
				rawTimelineSec: 13,
				trimmed: true,
				cropRegion: { x: 0, y: 0, width: 1, height: 1 },
			},
		]);
		expect(JSON.stringify(result)).not.toContain("/private");
		expect(JSON.stringify(f.holder.current)).toBe(before);
		expect(f.sink.toolEnd).toHaveBeenCalledWith("inspectVideoFrames", true, expect.any(String));
	});

	it.each([
		{ assetId: "missing", sourceTimesSec: [1] },
		{ assetId: "asset", sourceTimesSec: [10] },
		{ assetId: "asset", sourceTimesSec: [-1] },
		{ assetId: "asset", sourceTimesSec: [Number.NaN] },
		{ assetId: "asset", sourceTimesSec: [1], path: "/secret.mp4" },
		{ assetId: "asset", sourceTimesSec: [1, 2, 3, 4, 5] },
	])("refuses invalid selections before reading: %j", async (args) => {
		const f = fixture();
		expect(await f.tool.invoke(args)).toMatchObject({ isError: true });
		expect(f.read).not.toHaveBeenCalled();
	});

	it("caps the aggregate turn, clamps the last frame, and reports denied reads as failures", async () => {
		const f = fixture();
		await f.tool.invoke({ assetId: "asset", sourceTimesSec: [1, 2, 3, 4] });
		await f.tool.invoke({ assetId: "asset", sourceTimesSec: [5, 6, 7, 9.999] });
		expect(f.read.mock.calls.at(-1)?.[0]).toMatchObject({ sourceTimeSec: 10 - 1 / 30 });
		expect(await f.tool.invoke({ assetId: "asset", sourceTimesSec: [1] })).toMatchObject({
			isError: true,
		});
		expect(f.read).toHaveBeenCalledTimes(8);
		const denied = fixture();
		denied.read.mockRejectedValue(new Error("Declined"));
		expect(await denied.tool.invoke({ assetId: "asset", sourceTimesSec: [1] })).toMatchObject({
			isError: true,
		});
		expect(denied.sink.toolEnd).toHaveBeenLastCalledWith("inspectVideoFrames", false, "Declined");
	});
});

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
