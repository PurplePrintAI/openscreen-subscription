import path from "node:path";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { STUDIO_SETUP_CHANNEL, studioSetupRequestSchema } from "../../src/lib/studio-setup";
import { findClaudeExecutable } from "../ai-edition/claude/cli";
import { findCodexExecutable } from "../ai-edition/codex/app-server";
import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { resolveFfmpeg } from "../media/audioPeaks";
import { StudioSetupService } from "./service";

export function registerStudioSetupIpc() {
	const service = new StudioSetupService({
		profile: app.getPath("userData"),
		narrationFile:
			process.env.STUDIO_NARRATION_RUNTIME ||
			path.join(app.getPath("userData"), "narration-runtime.json"),
		narrationScriptDir: app.isPackaged
			? path.join(process.resourcesPath, "narration")
			: path.join(app.getAppPath(), "tools", "narration"),
		narrationOverride: !!process.env.STUDIO_NARRATION_RUNTIME,
		hyperframesFallback: path.join(app.getAppPath(), "tools", "hyperframes"),
		hyperframesOverride: process.env.STUDIO_HYPERFRAMES_RUNTIME_DIR,
		ffmpeg: resolveFfmpeg,
		findCli: (kind) => (kind === "codex" ? findCodexExecutable() : findClaudeExecutable()),
	});
	const pending = new Map<number, Promise<unknown>>();
	const tracked = new Set<number>();
	ipcMain.handle(STUDIO_SETUP_CHANNEL, async (event, raw) => {
		if (
			event.senderFrame !== event.sender.mainFrame ||
			!isStudioProductionSender(
				event.senderFrame.url,
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL,
			)
		)
			throw new Error("Untrusted setup caller.");
		const request = studioSetupRequestSchema.parse(raw),
			id = event.sender.id;
		if (!tracked.has(id)) {
			tracked.add(id);
			event.sender.once("destroyed", () => {
				service.reset(id);
				tracked.delete(id);
			});
		}
		const operation = (pending.get(id) ?? Promise.resolve())
			.catch(() => undefined)
			.then(async () => {
				if (event.sender.isDestroyed()) throw new Error("Setup window closed.");
				if (request.action === "reset") service.reset(id);
				if (request.action === "pick") {
					const owner = BrowserWindow.fromWebContents(event.sender);
					if (!owner) throw new Error("Editor is unavailable.");
					return await service.pick(id, request.field, async () => {
						const python = request.field === "pythonPath";
						const selected = await dialog.showOpenDialog(owner, {
							title: python
								? "Python 실행 파일 / Python executable"
								: "로컬 환경 폴더 / Local runtime folder",
							properties: [python ? "openFile" : "openDirectory"],
							...(python && process.platform === "win32"
								? { filters: [{ name: "Python", extensions: ["exe"] }] }
								: {}),
						});
						return selected.canceled ? null : (selected.filePaths[0] ?? null);
					});
				}
				if (request.action === "save") return await service.save(id, request.kind);
				return { snapshot: await service.status(id) };
			});
		pending.set(id, operation);
		try {
			return await operation;
		} finally {
			if (pending.get(id) === operation) pending.delete(id);
			if (event.sender.isDestroyed()) service.reset(id);
		}
	});
}
