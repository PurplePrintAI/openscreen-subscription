import { describe, expect, it, vi } from "vitest";
import { checkLatestRelease, compareVersions } from "./update-checker";

function releaseResponse(payload: unknown, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: vi.fn().mockResolvedValue(payload),
	};
}

const RELEASES_API =
	"https://api.github.com/repos/PurplePrintAI/openscreen-subscription/releases?per_page=100";

function release(
	tag: string,
	overrides: Partial<{ html_url: string; draft: boolean; prerelease: boolean }> = {},
) {
	return {
		tag_name: tag,
		html_url: `https://github.com/PurplePrintAI/openscreen-subscription/releases/tag/${tag}`,
		draft: false,
		prerelease: tag.includes("-"),
		...overrides,
	};
}

describe("compareVersions", () => {
	it("implements semantic version ordering for stable and prerelease builds", () => {
		expect(compareVersions("v2.0.0", "1.9.9")).toBeGreaterThan(0);
		expect(compareVersions("1.9.0", "1.9.0-rc.2")).toBeGreaterThan(0);
		expect(compareVersions("1.9.0-rc.10", "1.9.0-rc.2")).toBeGreaterThan(0);
		expect(compareVersions("1.9.0+build.2", "v1.9.0+build.1")).toBe(0);
	});

	it("preserves precision for oversized core identifiers", () => {
		expect(compareVersions("9007199254740993.0.0", "9007199254740992.0.0")).toBeGreaterThan(0);
	});

	it.each([
		"01.0.0",
		"1.02.0",
		"1.0.03",
		"1.0.0-rc.01",
	])("rejects leading-zero numeric identifiers in %s", (version) => {
		expect(() => compareVersions(version, "1.0.0")).toThrow("invalid semantic version");
	});
});

describe("checkLatestRelease", () => {
	it("selects the highest published release in the installed prerelease channel", async () => {
		const fetchLatest = vi
			.fn()
			.mockResolvedValue(
				releaseResponse([
					release("v1.10.0-subscription.6"),
					release("v1.10.0-beta.20"),
					release("v1.10.0-subscription.10", { draft: true }),
					release("v1.10.0-subscription.9"),
					release("v1.10.0-subscription.8"),
					release("v1.10.0"),
				]),
			);

		await expect(
			checkLatestRelease({ currentVersion: "1.10.0-subscription.7", fetchLatest }),
		).resolves.toEqual({
			kind: "available",
			currentVersion: "1.10.0-subscription.7",
			latestVersion: "1.10.0-subscription.9",
			releaseUrl:
				"https://github.com/PurplePrintAI/openscreen-subscription/releases/tag/v1.10.0-subscription.9",
		});
		expect(fetchLatest).toHaveBeenCalledWith(
			RELEASES_API,
			expect.objectContaining({
				headers: expect.objectContaining({ Accept: "application/vnd.github+json" }),
			}),
		);
	});

	it("reports current when only older subscription releases exist", async () => {
		const fetchLatest = vi
			.fn()
			.mockResolvedValue(releaseResponse([release("v1.10.0-subscription.7")]));
		await expect(
			checkLatestRelease({ currentVersion: "1.10.0-subscription.9", fetchLatest }),
		).resolves.toEqual({
			kind: "current",
			currentVersion: "1.10.0-subscription.9",
			latestVersion: "1.10.0-subscription.7",
		});
	});

	it("reports current when the fork has no published releases", async () => {
		const fetchLatest = vi.fn().mockResolvedValue(releaseResponse([]));
		await expect(
			checkLatestRelease({ currentVersion: "1.10.0-subscription.9", fetchLatest }),
		).resolves.toEqual({
			kind: "current",
			currentVersion: "1.10.0-subscription.9",
			latestVersion: "1.10.0-subscription.9",
		});
	});

	it("keeps stable installs on the stable channel", async () => {
		const fetchLatest = vi
			.fn()
			.mockResolvedValue(releaseResponse([release("v1.11.0-subscription.2"), release("v1.10.0")]));
		await expect(checkLatestRelease({ currentVersion: "1.9.0", fetchLatest })).resolves.toEqual({
			kind: "available",
			currentVersion: "1.9.0",
			latestVersion: "1.10.0",
			releaseUrl: "https://github.com/PurplePrintAI/openscreen-subscription/releases/tag/v1.10.0",
		});
	});

	it("ignores drafts, other channels, and malformed entries", async () => {
		const fetchLatest = vi
			.fn()
			.mockResolvedValue(
				releaseResponse([
					release("v1.10.0-subscription.12", { draft: true }),
					{ tag_name: "not a version", html_url: "https://example.com", draft: false },
					release("v1.10.0-beta.11"),
					release("v1.10.0-subscription.8"),
				]),
			);
		await expect(
			checkLatestRelease({ currentVersion: "1.10.0-subscription.7", fetchLatest }),
		).resolves.toMatchObject({ kind: "available", latestVersion: "1.10.0-subscription.8" });
	});

	it("forwards the cancellation signal", async () => {
		const fetchLatest = vi.fn().mockResolvedValue(releaseResponse([]));
		const controller = new AbortController();
		await checkLatestRelease({
			currentVersion: "1.10.0-subscription.9",
			fetchLatest,
			signal: controller.signal,
		});
		expect(fetchLatest).toHaveBeenCalledWith(
			RELEASES_API,
			expect.objectContaining({ signal: controller.signal }),
		);
	});

	it.each([
		"https://example.com/openscreen-9.9.9.exe",
		"https://github.com/PurplePrintAI/openscreen-subscription/releases/download/v9.9.9/app.zip",
		"https://github.com/PurplePrintAI/openscreen-subscription/releases/tag/v9.9.8",
		"https://github.com/PurplePrintAI/openscreen-subscription/releases/tag/v9.9.9?download=1",
		"https://github.com/PurplePrintAI/openscreen-subscription/releases/tag/v9.9.9#notes",
	])("rejects an untrusted candidate release URL: %s", async (htmlUrl) => {
		const fetchLatest = vi
			.fn()
			.mockResolvedValue(releaseResponse([release("v9.9.9", { html_url: htmlUrl })]));
		await expect(checkLatestRelease({ currentVersion: "1.9.0", fetchLatest })).rejects.toThrow(
			"untrusted release URL",
		);
	});

	it("rejects unsuccessful or malformed GitHub responses", async () => {
		const unavailable = vi.fn().mockResolvedValue(releaseResponse({}, 503));
		await expect(
			checkLatestRelease({ currentVersion: "1.9.0", fetchLatest: unavailable }),
		).rejects.toThrow("GitHub release check failed (503)");
		const malformed = vi.fn().mockResolvedValue(releaseResponse({ tag_name: "v2.0.0" }));
		await expect(
			checkLatestRelease({ currentVersion: "1.9.0", fetchLatest: malformed }),
		).rejects.toThrow("invalid GitHub release response");
	});
});
