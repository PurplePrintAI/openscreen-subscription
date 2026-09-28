import { describe, expect, it } from "vitest";
import { webDemuxerWasmUrl } from "./extractMono16kWebDemuxer";

describe("webDemuxerWasmUrl", () => {
	it("resolves the WASM beside a packaged editor page", () => {
		expect(
			webDemuxerWasmUrl("file:///C:/Apps/PurplePrint%20Studio/resources/app.asar/dist/index.html"),
		).toBe("file:///C:/Apps/PurplePrint%20Studio/resources/app.asar/dist/wasm/web-demuxer.wasm");
	});

	it("resolves the same public asset in development", () => {
		expect(webDemuxerWasmUrl("http://localhost:5173/index.html")).toBe(
			"http://localhost:5173/wasm/web-demuxer.wasm",
		);
	});
});
