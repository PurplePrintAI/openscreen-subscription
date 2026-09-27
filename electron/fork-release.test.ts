import path from "node:path";
import { getConfig } from "app-builder-lib/out/util/config/config";
import { describe, expect, it } from "vitest";

describe("fork release identity", () => {
	it("keeps installation and update identity separate from upstream", async () => {
		const config = await getConfig(process.cwd(), path.resolve("electron-builder.fork.json"), null);
		expect(config.appId).not.toBe("com.etiennelescot.openscreen");
		expect(config.extraMetadata?.name).toBe("openscreen-subscription");
		expect(config.extraMetadata?.author).toEqual({
			name: "PurplePrintAI",
			url: "https://github.com/PurplePrintAI",
		});
		// Arrays are concatenated during inheritance; an object replaces the upstream feed.
		expect(config.publish).toEqual({
			provider: "github",
			owner: "PurplePrintAI",
			repo: "openscreen-subscription",
		});
		expect(config.nsis?.createStartMenuShortcut).toBe(true);
		const targets = (config.extraResources as Array<{ to: string }>).map((entry) => entry.to);
		// Duplicate resource targets race in copyFile on Windows.
		expect(new Set(targets).size).toBe(targets.length);
		expect(targets).toEqual(
			expect.arrayContaining([
				"LICENSE",
				"THIRD-PARTY-NOTICES.md",
				"FORK.md",
				"FORK-UPSTREAM-REVIEW.md",
			]),
		);
	});
});
