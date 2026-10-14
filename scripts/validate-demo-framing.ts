// Opt-in real Chromium geometry/capture check. A diagnostic fixture, not product footage or GUI QA.
import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { app } from "electron";
import { ProductDemoBrowser } from "../electron/product-demo/browser";
import { ProductDemoService } from "../electron/product-demo/service";
import { documentSchema } from "../src/lib/ai-edition/schema";

const option = (key: string) =>
	process.argv.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const out = option("out");
const ffmpeg = option("ffmpeg");
if (!out || !path.isAbsolute(out) || !ffmpeg || !path.isAbsolute(ffmpeg))
	throw new Error("Provide --out=absolute-folder --ffmpeg=absolute-executable");
mkdirSync(out, { recursive: true });
app.setPath("userData", path.join(out, "qa-profile"));
app.on("window-all-closed", () => {
	/* Quit after writing verification. */
});
void app
	.whenReady()
	.then(async () => {
		const server = createServer((_request, response) => {
			response.setHeader("Content-Type", "text/html; charset=utf-8");
			response.end(
				"<!doctype html><title>Geometry diagnostic only</title><style>body{font:24px sans-serif;margin:80px;background:#f7f7f8}h1{font-size:40px}p{max-width:600px}</style><h1>Observed focus fixture</h1><p>Local geometry and recording test. This is not PurplePrint product footage.</p>",
			);
		});
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const address = server.address();
		if (!address || typeof address === "string") throw new Error("No fixture address.");
		const service = new ProductDemoService({
			root: out,
			createBrowser: () => new ProductDemoBrowser(),
			ffmpeg: () => ffmpeg,
			saveDocument: async (doc) => doc,
			planner: async (_brief, page) => ({
				title: "Geometry diagnostic",
				summary: "No model call or product claim.",
				scenes: [
					{
						title: "Observed heading",
						targetId: page.targets.find((t) => t.kind === "heading")!.id,
						caption: "Diagnostic fixture only",
						durationSec: 8,
						framing: { startSec: 3, endSec: 6, scale: 1.25 },
					},
				],
			}),
		});
		try {
			const review = await service.plan({
				url: `http://127.0.0.1:${address.port}`,
				product: "Geometry QA",
				intent: "Verify measured stationary focus and editable native zoom output.",
				maxSeconds: 18,
				language: "en",
			});
			if (!review.jobId || !review.plan) throw new Error(review.error || "No plan.");
			const result = await service.record(review.jobId, review.plan);
			if (result.phase !== "ready" || !result.folder)
				throw new Error(result.error || "Capture failed.");
			const doc = documentSchema.parse(
				JSON.parse(await fs.readFile(path.join(result.folder, "draft.openscreen"), "utf8")),
			);
			if (doc.zoomRanges.length !== 1 || result.warnings?.length)
				throw new Error("Observed focus did not produce an editable zoom.");
			await fs.writeFile(
				path.join(out, "validation.json"),
				JSON.stringify(
					{
						result,
						zoom: doc.zoomRanges[0],
						evidence:
							"Real Chromium geometry and capture; deterministic fixture planner, no model or GUI smoke claim.",
					},
					null,
					2,
				),
			);
			console.log(JSON.stringify({ passed: true, folder: result.folder, zoom: doc.zoomRanges[0] }));
		} finally {
			service.cancel();
			server.close();
		}
	})
	.then(() => app.exit(0))
	.catch((error) => {
		console.error(error);
		app.exit(1);
	});
