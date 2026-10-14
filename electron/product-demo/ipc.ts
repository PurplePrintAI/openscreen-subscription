import path from "node:path";
import { app, ipcMain } from "electron";
import {
	type DemoStatus,
	demoRequestSchema,
	PRODUCT_DEMO_CHANNEL,
} from "../../src/lib/product-demo";
import type { DocumentService } from "../ai-edition/document-service";
import type { LlmConfigStore } from "../ai-edition/llm-config-store";
import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { resolveFfmpeg } from "../media/audioPeaks";
import { ProductDemoBrowser } from "./browser";
import { subscriptionDemoPlanner } from "./planner-runtime";
import { ProductDemoService } from "./service";

export function registerProductDemoIpc(
	documents: DocumentService,
	configStore: () => LlmConfigStore,
): void {
	const service = new ProductDemoService({
		root: path.join(app.getPath("userData"), "product-demos"),
		createBrowser: () => new ProductDemoBrowser(),
		ffmpeg: () => resolveFfmpeg(),
		saveDocument: (doc) => documents.saveProject(doc),
		planner: subscriptionDemoPlanner(() => configStore().getConfig()),
	});
	let owner: number | null = null;
	ipcMain.handle(PRODUCT_DEMO_CHANNEL, async (event, raw): Promise<DemoStatus> => {
		if (
			event.senderFrame !== event.sender.mainFrame ||
			!isStudioProductionSender(
				event.senderFrame.url,
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL,
			)
		)
			throw new Error("Untrusted production caller.");
		const request = demoRequestSchema.parse(raw);
		if (owner !== null && owner !== event.sender.id)
			throw new Error("Production belongs to another Studio window.");
		if (owner === null) {
			owner = event.sender.id;
			event.sender.once("destroyed", () => {
				service.cancel();
				owner = null;
			});
		}
		switch (request.action) {
			case "status":
				return service.status();
			case "cancel":
				return service.cancel();
			case "plan":
				return service.plan(request.brief);
			case "record":
				return service.record(request.jobId, request.plan);
		}
	});
	app.on("before-quit", () => {
		service.cancel();
	});
}
