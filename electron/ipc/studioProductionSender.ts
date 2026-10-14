import path from "node:path";
import { fileURLToPath } from "node:url";

/** Production tools accept only the app renderer (or its configured dev origin). */
export function isStudioProductionSender(url: string, appPath: string, devUrl?: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol === "file:")
			return path.resolve(fileURLToPath(parsed)) === path.resolve(appPath, "dist", "index.html");
		return Boolean(devUrl && parsed.origin === new URL(devUrl).origin);
	} catch {
		return false;
	}
}
