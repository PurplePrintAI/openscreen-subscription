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
		const parent = fs.readFileSync(path.resolve("electron-builder.json5"), "utf8");
		const inheritedResources = parent.match(/"extraResources"\s*:\s*\[([\s\S]*?)\]/)?.[1] ?? "";
		const inheritedTargets = [...inheritedResources.matchAll(/"to"\s*:\s*"([^"]+)"/g)].map(
			(match) => match[1],
		);
		const forkTargets: string[] = config.extraResources.map((entry: { to: string }) => entry.to);
		// electron-builder concatenates these arrays. Duplicate targets race in copyFile on Windows.
		expect(forkTargets.filter((target) => inheritedTargets.includes(target))).toEqual([]);
		expect([...inheritedTargets, ...forkTargets]).toEqual(
			expect.arrayContaining(["LICENSE", "THIRD-PARTY-NOTICES.md", "FORK.md"]),
		);
	});
});
