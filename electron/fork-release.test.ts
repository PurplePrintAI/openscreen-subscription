import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("fork release identity", () => {
	it("keeps installation and update identity separate from upstream", () => {
		const config = JSON.parse(fs.readFileSync(path.resolve("electron-builder.fork.json"), "utf8"));
		expect(config.appId).not.toBe("com.etiennelescot.openscreen");
		expect(config.extraMetadata.name).toBe("openscreen-subscription");
		expect(config.publish).toEqual([
			{ provider: "github", owner: "PurplePrintAI", repo: "openscreen-subscription" },
		]);
		expect(config.nsis.createStartMenuShortcut).toBe(true);
		expect(config.extraResources.map((entry: { to: string }) => entry.to)).toEqual(
			expect.arrayContaining(["LICENSE", "THIRD-PARTY-NOTICES.md", "FORK.md"]),
		);
	});
});
