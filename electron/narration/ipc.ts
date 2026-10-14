import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
	NARRATION_CHANNEL,
	NARRATION_EXPORT_CHANNEL,
	narrationExportRequestSchema,
	narrationRequestSchema,
} from "../../src/lib/narration";
import type { DocumentService } from "../ai-edition/document-service";
import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { resolveFfmpeg } from "../media/audioPeaks";
import { consumeNarrationExport, mixNarrationExport } from "./export";
import { NarrationService } from "./service";

export function registerNarrationIpc(documents: DocumentService) {
	const services = new Map<number, NarrationService>();
	const exports = new Map<number, AbortController>();
	ipcMain.handle(NARRATION_EXPORT_CHANNEL, async (event, raw) => {
		if (
			event.senderFrame !== event.sender.mainFrame ||
			!isStudioProductionSender(
				event.senderFrame.url,
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL,
			)
		)
			throw new Error("Untrusted narration export caller.");
		const request = narrationExportRequestSchema.parse(raw);
		if (exports.has(event.sender.id)) throw new Error("A narration export is already running.");
		consumeNarrationExport(event.sender.id, request.outputPath);
		const controller = new AbortController();
		const cancel = () => controller.abort();
		exports.set(event.sender.id, controller);
		event.sender.once("destroyed", cancel);
		try {
			await mixNarrationExport(
				request,
				{ ffmpeg: resolveFfmpeg, getDocument: (id) => documents.getProject(id) },
				controller.signal,
			);
			return { success: true };
		} catch (error) {
			return { success: false, message: String(error) };
		} finally {
			event.sender.removeListener("destroyed", cancel);
			exports.delete(event.sender.id);
		}
	});
	ipcMain.handle(NARRATION_CHANNEL, async (event, raw) => {
		if (
			event.senderFrame !== event.sender.mainFrame ||
			!isStudioProductionSender(
				event.senderFrame.url,
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL,
			)
		)
			throw new Error("Untrusted narration caller.");
		const request = narrationRequestSchema.parse(raw);
		let service = services.get(event.sender.id);
		if (!service) {
			service = new NarrationService({
				root: path.join(app.getPath("userData"), "narration"),
				runtimeFile:
					process.env.STUDIO_NARRATION_RUNTIME ||
					path.join(app.getPath("userData"), "narration-runtime.json"),
				scriptDir: app.isPackaged
					? path.join(process.resourcesPath, "narration")
					: path.join(app.getAppPath(), "tools", "narration"),
				ffmpeg: resolveFfmpeg,
			});
			services.set(event.sender.id, service);
			event.sender.once("destroyed", () => {
				services.get(event.sender.id)?.cancel();
				services.delete(event.sender.id);
			});
		}
		switch (request.action) {
			case "status":
				return service.status();
			case "cancel":
				service.cancel();
				return service.status();
			case "generate":
				return service.generate(request.input);
			case "pick-reference": {
				const owner = BrowserWindow.fromWebContents(event.sender);
				if (!owner) throw new Error("Editor window is unavailable.");
				const result = await dialog.showOpenDialog(owner, {
					title: "내 목소리 · 3–30초 녹음",
					properties: ["openFile"],
					filters: [{ name: "Audio", extensions: ["wav", "flac", "m4a", "mp3"] }],
				});
				return result.canceled || !result.filePaths[0]
					? service.status()
					: service.prepareReference(result.filePaths[0]);
			}
		}
	});
	app.on("before-quit", () => {
		for (const controller of exports.values()) controller.abort();
		for (const service of services.values()) service.cancel();
	});
}
