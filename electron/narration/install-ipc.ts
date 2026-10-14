import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import {
	NARRATION_INSTALL_CHANNEL,
	narrationInstallRequest,
} from "../../src/lib/narration-install";
import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { NarrationInstallService } from "./install-service";

export function registerNarrationInstallIpc() {
	const service = new NarrationInstallService({
		profile: app.getPath("userData"),
		scriptDir: app.isPackaged
			? path.join(process.resourcesPath, "narration")
			: path.join(app.getAppPath(), "tools", "narration"),
		override: !!process.env.STUDIO_NARRATION_RUNTIME,
	});
	let active: Promise<unknown> | null = null;
	let activeOwner: number | null = null;
	let quitting = false;
	const tracked = new Set<number>();
	ipcMain.handle(NARRATION_INSTALL_CHANNEL, async (event, raw) => {
		if (
			event.senderFrame !== event.sender.mainFrame ||
			!isStudioProductionSender(
				event.senderFrame.url,
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL,
			)
		)
			throw new Error("Untrusted installer caller.");
		const request = narrationInstallRequest.parse(raw),
			id = event.sender.id;
		if (active && activeOwner !== id) throw new Error("Installer is busy in another window.");
		if (!tracked.has(id)) {
			tracked.add(id);
			event.sender.once("destroyed", () => {
				service.close(id);
				tracked.delete(id);
			});
		}
		// Poll/cancel must never wait behind a download or diagnostic subprocess.
		if (request.action === "cancel") {
			service.cancel(id);
			return service.status(id);
		}
		if (request.action === "status") return service.status(id);
		if (active || quitting) throw new Error("Installer is busy.");
		activeOwner = id;
		const operation = (async () => {
			if (request.action === "plan") return service.prepare(id, request.mode);
			if (request.action === "install") return service.install(id, request.planId);
			const owner = BrowserWindow.fromWebContents(event.sender);
			if (!owner) throw new Error("Editor is unavailable.");
			return service.pick(id, request.field, async () => {
				const python = request.field === "python";
				const result = await dialog.showOpenDialog(owner, {
					title: python
						? "Python 3.12 실행 파일 / executable"
						: "음성 모델 폴더 / Voice model folder",
					properties: [python ? "openFile" : "openDirectory"],
					...(python ? { filters: [{ name: "Python", extensions: ["exe"] }] } : {}),
				});
				return result.canceled ? null : (result.filePaths[0] ?? null);
			});
		})();
		active = operation;
		try {
			return await operation;
		} finally {
			active = null;
			activeOwner = null;
		}
	});
	app.on("before-quit", (event) => {
		if (!active) return;
		event.preventDefault();
		if (quitting) return;
		quitting = true;
		if (activeOwner !== null) service.close(activeOwner);
		void active.catch(() => undefined).then(() => app.quit());
	});
}
