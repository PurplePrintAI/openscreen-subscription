import { app, ipcMain } from "electron";
import { SCENE_PLANNER_CHANNEL } from "../../src/lib/scene-planner";
import type { LlmConfigStore } from "../ai-edition/llm-config-store";
import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { ScenePlannerService } from "./service";

export function registerScenePlannerIpc(getConfig: () => LlmConfigStore) {
	const services = new Map<number, ScenePlannerService>();
	ipcMain.handle(SCENE_PLANNER_CHANNEL, (event, raw) => {
		if (
			event.senderFrame !== event.sender.mainFrame ||
			!isStudioProductionSender(
				event.senderFrame.url,
				app.getAppPath(),
				process.env.VITE_DEV_SERVER_URL,
			)
		)
			throw new Error("Untrusted planning caller.");
		let service = services.get(event.sender.id);
		if (!service) {
			service = new ScenePlannerService(getConfig);
			services.set(event.sender.id, service);
			event.sender.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
				if (isMainFrame) services.get(event.sender.id)?.cancel();
			});
			event.sender.once("destroyed", () => {
				services.get(event.sender.id)?.cancel();
				services.delete(event.sender.id);
			});
		}
		return service.handle(raw);
	});
	app.on("before-quit", () => {
		for (const service of services.values()) service.cancel();
	});
}
