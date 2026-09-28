// GitHub's /releases/latest omits prereleases. This fork currently publishes
// subscription.N builds as prereleases, so that endpoint returns 404 even when
// the app has an update feed. Inspect the published releases instead.
const RELEASES_API =
	"https://api.github.com/repos/PurplePrintAI/openscreen-subscription/releases?per_page=100";
const OFFICIAL_RELEASE_PREFIX = "/PurplePrintAI/openscreen-subscription/releases/tag/";

interface ReleaseResponse {
	ok: boolean;
	status: number;
	json(): Promise<unknown>;
}

type FetchLatestRelease = (
	url: string,
	init: {
		headers: Record<string, string>;
		signal?: AbortSignal;
	},
) => Promise<ReleaseResponse>;

interface ParsedVersion {
	major: bigint;
	minor: bigint;
	patch: bigint;
	prerelease: string[];
	normalized: string;
}

function parseVersion(value: string): ParsedVersion {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(
		value.trim(),
	);
	if (!match) throw new Error(`invalid semantic version: ${value}`);
	const prerelease = match[4]?.split(".") ?? [];
	const coreIdentifiers = [match[1], match[2], match[3]];
	if (
		[...coreIdentifiers, ...prerelease].some(
			(identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier[0] === "0",
		)
	) {
		throw new Error(`invalid semantic version: ${value}`);
	}
	const major = BigInt(match[1]);
	const minor = BigInt(match[2]);
	const patch = BigInt(match[3]);
	const core = `${major}.${minor}.${patch}`;
	return {
		major,
		minor,
		patch,
		prerelease,
		normalized: prerelease.length > 0 ? `${core}-${prerelease.join(".")}` : core,
	};
}

function comparePrerelease(left: string[], right: string[]): number {
	if (left.length === 0 || right.length === 0) {
		return left.length === right.length ? 0 : left.length === 0 ? 1 : -1;
	}
	for (let i = 0; i < Math.max(left.length, right.length); i++) {
		const a = left[i];
		const b = right[i];
		if (a === undefined || b === undefined) return a === b ? 0 : a === undefined ? -1 : 1;
		if (a === b) continue;
		const aNumeric = /^\d+$/.test(a);
		const bNumeric = /^\d+$/.test(b);
		if (aNumeric && bNumeric) return BigInt(a) > BigInt(b) ? 1 : -1;
		if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
		return a > b ? 1 : -1;
	}
	return 0;
}

export function compareVersions(left: string, right: string): number {
	const a = parseVersion(left);
	const b = parseVersion(right);
	for (const key of ["major", "minor", "patch"] as const) {
		if (a[key] !== b[key]) return a[key] > b[key] ? 1 : -1;
	}
	return comparePrerelease(a.prerelease, b.prerelease);
}

function officialReleaseUrl(value: string, tag: string): string {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("untrusted release URL");
	}
	const encodedTag = url.pathname.slice(OFFICIAL_RELEASE_PREFIX.length);
	let decodedTag = "";
	try {
		decodedTag = decodeURIComponent(encodedTag);
	} catch {
		throw new Error("untrusted release URL");
	}
	if (
		url.protocol !== "https:" ||
		url.hostname !== "github.com" ||
		url.port !== "" ||
		!url.pathname.startsWith(OFFICIAL_RELEASE_PREFIX) ||
		decodedTag !== tag ||
		url.search !== "" ||
		url.hash !== ""
	) {
		throw new Error("untrusted release URL");
	}
	return url.toString();
}

export type UpdateCheckResult =
	| {
			kind: "available";
			currentVersion: string;
			latestVersion: string;
			releaseUrl: string;
	  }
	| {
			kind: "current";
			currentVersion: string;
			latestVersion: string;
	  };

export async function checkLatestRelease(options: {
	currentVersion: string;
	fetchLatest: FetchLatestRelease;
	signal?: AbortSignal;
}): Promise<UpdateCheckResult> {
	const response = await options.fetchLatest(RELEASES_API, {
		headers: {
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
		},
		...(options.signal ? { signal: options.signal } : {}),
	});
	if (!response.ok) throw new Error(`GitHub release check failed (${response.status})`);

	const payload = await response.json();
	if (!Array.isArray(payload)) throw new Error("invalid GitHub release response");
	const current = parseVersion(options.currentVersion);
	const channel = current.prerelease[0] ?? null;
	let latest: { version: string; tag: string; url: string } | null = null;
	for (const entry of payload) {
		if (typeof entry !== "object" || entry === null || entry.draft !== false) continue;
		if (typeof entry.tag_name !== "string" || typeof entry.html_url !== "string") continue;
		let version: ParsedVersion;
		try {
			version = parseVersion(entry.tag_name);
		} catch {
			continue;
		}
		// Match electron-updater's GitHub channel: stable installs stay stable;
		// subscription prereleases only advance within the subscription channel.
		if ((version.prerelease[0] ?? null) !== channel) continue;
		if (!latest || compareVersions(version.normalized, latest.version) > 0) {
			latest = { version: version.normalized, tag: entry.tag_name, url: entry.html_url };
		}
	}
	if (!latest || compareVersions(latest.version, current.normalized) <= 0) {
		return {
			kind: "current",
			currentVersion: current.normalized,
			latestVersion: latest?.version ?? current.normalized,
		};
	}

	return {
		kind: "available",
		currentVersion: current.normalized,
		latestVersion: latest.version,
		releaseUrl: officialReleaseUrl(latest.url, latest.tag),
	};
}
