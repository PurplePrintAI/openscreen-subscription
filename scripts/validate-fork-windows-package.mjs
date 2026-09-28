import { createHash } from "node:crypto";
import {
	createReadStream,
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import { extractFile, listPackage } from "@electron/asar";

const root = path.resolve(import.meta.dirname, "..");
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const release = path.join(root, "release", version);
const unpacked = path.join(release, "win-unpacked");
const resources = path.join(unpacked, "resources");
const installerName = `PurplePrint-Studio-${version}-Windows-x64-Setup.exe`;
const installer = path.join(release, installerName);
const blockmap = `${installer}.blockmap`;
const feed = path.join(release, "latest.yml");
const asar = path.join(resources, "app.asar");
const nativeDir = path.join(resources, "electron", "native", "bin", "win32-x64");

function requireFile(file) {
	if (!existsSync(file) || !statSync(file).isFile()) {
		throw new Error(`Missing packaged file: ${path.relative(root, file)}`);
	}
	return file;
}

async function sha256(file) {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(requireFile(file))) hash.update(chunk);
	return hash.digest("hex");
}

for (const file of [
	installer,
	blockmap,
	feed,
	path.join(unpacked, "PurplePrint Studio.exe"),
	asar,
	...[
		"LICENSE",
		"THIRD-PARTY-NOTICES.md",
		"FORK.md",
		"FORK-CHANGELOG.md",
		"FORK-UPSTREAM-REVIEW.md",
	].map((name) => path.join(resources, name)),
	...[
		"compositor_view.node",
		"wgc-capture.exe",
		"cursor-sampler.exe",
		"whisper-stt-server.exe",
	].map((name) => path.join(nativeDir, name)),
]) {
	requireFile(file);
}

for (const family of ["avcodec", "avformat", "avutil"]) {
	if (!readdirSync(nativeDir).some((name) => new RegExp(`^${family}-\\d+\\.dll$`).test(name))) {
		throw new Error(`Missing packaged ${family} DLL`);
	}
}

const updateConfig = readFileSync(path.join(resources, "app-update.yml"), "utf8");
for (const line of ["owner: PurplePrintAI", "repo: openscreen-subscription", "provider: github"]) {
	if (!updateConfig.split(/\r?\n/).includes(line))
		throw new Error(`Unexpected update feed: ${line}`);
}
const latestYaml = readFileSync(feed, "utf8");
if (!latestYaml.includes(`version: ${version}`) || !latestYaml.includes(installerName)) {
	throw new Error("Windows update feed does not match the installer version/name");
}

const packagedFiles = new Set(
	listPackage(asar).map((name) => name.replaceAll("\\", "/").replace(/^\/+/, "")),
);
if (!packagedFiles.has("dist/wasm/web-demuxer.wasm")) {
	throw new Error("Packaged transcription WASM is missing");
}
const packagedManifest = JSON.parse(extractFile(asar, "package.json").toString());
if (packagedManifest.version !== version || packagedManifest.name !== "openscreen-subscription") {
	throw new Error("Packaged version or technical identity is wrong");
}
const transcribeChunk = [...packagedFiles].find((name) =>
	/^dist\/assets\/transcribe-[^/]+\.js$/.test(name),
);
if (!transcribeChunk) throw new Error("Packaged transcription chunk is missing");
const source = extractFile(asar, transcribeChunk.replaceAll("/", "\\")).toString();
if (
	!source.includes("./wasm/web-demuxer.wasm") ||
	source.includes("../exporter/wasm/web-demuxer.wasm")
) {
	throw new Error("Packaged transcription WASM URL is incorrect");
}

const compositor = path.join(nativeDir, "compositor_view.node");
const buildOutputCompositor = path.join(root, "crates", "target", "release", "compositor_view.dll");
if ((await sha256(compositor)) !== (await sha256(buildOutputCompositor))) {
	throw new Error("Packaged compositor differs from the native build output");
}
const wgc = path.join(nativeDir, "wgc-capture.exe");
if (
	(await sha256(wgc)) !==
	(await sha256(path.join(root, "electron", "native", "bin", "win32-x64", "wgc-capture.exe")))
) {
	throw new Error("Packaged WGC helper differs from the native build output");
}

const installerSha = await sha256(installer);
const blockmapSha = await sha256(blockmap);
const feedSha = await sha256(feed);
const validation = {
	product: "PurplePrint Studio",
	version,
	architecture: "x64",
	appId: "io.github.purpleprintai.openscreen-subscription",
	sourceCommit: process.env.GITHUB_SHA ?? null,
	prHeadCommit: process.env.GITHUB_HEAD_SHA || null,
	checks: {
		forkUpdateFeed: true,
		packageIdentity: true,
		attribution: true,
		nativePayloadPresent: true,
		compositorMatchesBuildOutput: true,
		wgcMatchesFreshBuild: true,
		transcriptionWasm: true,
		windowsUpdateFeed: true,
	},
	installer: { name: installerName, bytes: statSync(installer).size, sha256: installerSha },
};
writeFileSync(
	path.join(release, "windows-validation.json"),
	`${JSON.stringify(validation, null, 2)}\n`,
);
writeFileSync(
	path.join(release, "SHA256SUMS-Windows.txt"),
	`${installerSha}  ${installerName}\n${blockmapSha}  ${path.basename(blockmap)}\n${feedSha}  latest.yml\n`,
);
console.log(`Validated PurplePrint Studio ${version} Windows x64 package`);
