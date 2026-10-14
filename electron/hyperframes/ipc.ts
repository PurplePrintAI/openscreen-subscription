import path from "node:path";
import { app, ipcMain, shell } from "electron";
import {
	HYPERFRAMES_CHANNEL,
	type HyperframesStatus,
	hyperframesRequestSchema,
} from "../../src/lib/hyperframes";
import type { DocumentService } from "../ai-edition/document-service";
import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { resolveHyperframesDirectory } from "../studio-setup/service";
import { HyperframesService } from "./service";

export function registerHyperframesIpc(documents: DocumentService): void {
	const service = new HyperframesService({
		root: path.join(app.getPath("userData"), "motion-scenes"),
		runtimeDir:
			process.env.STUDIO_HYPERFRAMES_RUNTIME_DIR ||
			path.join(app.getAppPath(), "tools", "hyperframes"),
		resolveRuntimeDir: () =>
			resolveHyperframesDirectory(
				app.getPath("userData"),
				path.join(app.getAppPath(), "tools", "hyperframes"),
				process.env.STUDIO_HYPERFRAMES_RUNTIME_DIR,
			),
		getDocument: (id) => documents.getProject(id),
		saveDocument: (doc) => documents.saveProject(doc),
	});
	let owner: number | null = null;
	ipcMain.handle(HYPERFRAMES_CHANNEL, async (event, raw): Promise<HyperframesStatus> => {
		if (
			event.senderFrame !== event.sender.mainFrame ||
			!isStudioProductionSender(
				event.senderFrame.url,
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL,
			)
		)
			throw new Error("Untrusted HyperFrames caller.");
		const request = hyperframesRequestSchema.parse(raw);
		if (owner !== null && owner !== event.sender.id)
			throw new Error("The render belongs to another Studio window.");
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
				service.cancel();
				return service.status();
			case "render":
				return service.render(request.scene);
			case "reveal": {
				const error = await shell.openPath(service.folderFor(request.jobId));
				if (error) throw new Error(error);
				return service.status();
			}
		}
	});
	app.on("before-quit", () => service.cancel());
}
