import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { NARRATION_CHANNEL, narrationRequestSchema } from "../../src/lib/narration";
import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { resolveFfmpeg } from "../media/audioPeaks";
import { NarrationService } from "./service";

export function registerNarrationIpc() {
	const services = new Map<number, NarrationService>();
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
		for (const service of services.values()) service.cancel();
	});
}
