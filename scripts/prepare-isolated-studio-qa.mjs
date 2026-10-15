// Assemble a local developer QA folder. Never starts Electron, installs an app,
// copies an existing profile, or downloads runtimes. Not a distributable installer.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const options = new Map(
	process.argv.slice(2).map((arg) => {
		const split = arg.indexOf("=");
		if (!arg.startsWith("--") || split < 3) throw new Error("Use --name=absolute-path options.");
		return [arg.slice(2, split), arg.slice(split + 1)];
	}),
);
for (const key of options.keys())
	if (!["out", "narration-runtime", "hyperframes-runtime"].includes(key))
		throw new Error(`Unknown option: ${key}`);
const out = options.get("out");
if (!out || !path.isAbsolute(out) || process.platform !== "win32")
	throw new Error("Provide a new absolute --out directory on Windows.");
for (const [key, value] of options)
	if (!path.isAbsolute(value)) throw new Error(`${key} must be absolute.`);

const required = [
	"dist/index.html",
	"dist-electron/main.js",
	"dist-electron/preload.mjs",
	"electron/native/bin/win32-x64/compositor_view.node",
	"electron/native/bin/win32-x64/ffmpeg-shared.exe",
	"node_modules/electron/dist/electron.exe",
	"tools/narration/generate.py",
	"tools/narration/transcribe.py",
	"tools/narration/probe_runtime.py",
];
for (const file of required) await fs.access(path.join(repo, file));
if (options.has("narration-runtime")) {
	const config = JSON.parse(await fs.readFile(options.get("narration-runtime"), "utf8"));
	const keys = ["pythonPath", "cloneModel", "presetModel", "whisperModel"];
	if (Object.keys(config).some((key) => !keys.includes(key)))
		throw new Error("Unexpected narration runtime fields.");
	for (const key of keys) {
		if (typeof config[key] !== "string" || !path.isAbsolute(config[key]))
			throw new Error(`Missing local ${key}.`);
		await fs.access(config[key]);
	}
}
if (options.has("hyperframes-runtime"))
	await fs.access(path.join(options.get("hyperframes-runtime"), "local-runtime.json"));

// Fail rather than reuse or remove another QA folder.
await fs.mkdir(out);
const qa = path.join(out, "qa-app");
await fs.mkdir(path.join(qa, "qa-profile", "projects"), { recursive: true });
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
const copied = [];
async function copyTree(relative) {
	const source = path.join(repo, relative),
		target = path.join(qa, relative);
	const stat = await fs.lstat(source);
	if (stat.isSymbolicLink()) throw new Error(`Refuse to copy linked build input: ${relative}`);
	if (stat.isDirectory()) {
		await fs.mkdir(target, { recursive: true });
		for (const name of await fs.readdir(source)) await copyTree(path.join(relative, name));
	} else if (stat.isFile()) {
		await fs.mkdir(path.dirname(target), { recursive: true });
		const bytes = await fs.readFile(source);
		await fs.writeFile(target, bytes, { flag: "wx" });
		if (digest(await fs.readFile(target)) !== digest(bytes))
			throw new Error(`Copy mismatch: ${relative}`);
		copied.push({
			path: relative.replaceAll("\\", "/"),
			bytes: bytes.length,
			sha256: digest(bytes),
		});
	}
}
for (const relative of [
	"dist",
	"dist-electron",
	"electron/native/bin/win32-x64",
	"LICENSE",
	"THIRD-PARTY-NOTICES.md",
])
	await copyTree(relative);
for (const file of ["generate.py", "transcribe.py", "probe_runtime.py", "README.md", "vendor"])
	await copyTree(`tools/narration/${file}`);
await fs.symlink(
	await fs.realpath(path.join(repo, "node_modules")),
	path.join(qa, "node_modules"),
	"junction",
);
const pkg = JSON.parse(await fs.readFile(path.join(repo, "package.json"), "utf8"));
await fs.writeFile(
	path.join(qa, "package.json"),
	JSON.stringify(
		{
			name: "purpleprint-studio-isolated-qa",
			version: pkg.version,
			type: "module",
			main: "bootstrap.cjs",
		},
		null,
		2,
	),
);
const runtime = options.get("narration-runtime");
if (runtime) await fs.copyFile(runtime, path.join(qa, "qa-profile", "narration-runtime.json"));
const hyperframes = options.get("hyperframes-runtime");
await fs.writeFile(
	path.join(qa, "bootstrap.cjs"),
	`const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const profile = path.join(__dirname, 'qa-profile');
fs.mkdirSync(path.join(profile, 'chromium'), {recursive:true});
fs.mkdirSync(path.join(__dirname, 'logs'), {recursive:true});
app.setName('PurplePrint Studio - Isolated QA');
app.setPath('userData', profile);
app.setPath('sessionData', path.join(profile, 'chromium'));
app.setPath('logs', path.join(__dirname, 'logs'));
delete process.env.VITE_DEV_SERVER_URL;
delete process.env.STUDIO_NARRATION_RUNTIME;
delete process.env.STUDIO_HYPERFRAMES_RUNTIME_DIR;
${runtime ? "process.env.STUDIO_NARRATION_RUNTIME = path.join(profile, 'narration-runtime.json');" : ""}
${hyperframes ? `process.env.STUDIO_HYPERFRAMES_RUNTIME_DIR = ${JSON.stringify(hyperframes)};` : ""}
process.env.OPENSCREEN_FFMPEG_PATH = path.join(__dirname, 'electron/native/bin/win32-x64/ffmpeg-shared.exe');
const stopFile = path.join(__dirname, 'close.signal');
if (fs.existsSync(stopFile)) fs.unlinkSync(stopFile);
const timer = setInterval(() => {
  if (fs.existsSync(stopFile)) { clearInterval(timer); app.quit(); }
}, 300);
timer.unref();
import('./dist-electron/main.js');
`,
);
await fs.writeFile(
	path.join(out, "Launch-QA.cmd"),
	'@echo off\r\nsetlocal\r\nset "ELECTRON_RUN_AS_NODE="\r\n"%~dp0qa-app\\node_modules\\electron\\dist\\electron.exe" "%~dp0qa-app"\r\n',
);
await fs.writeFile(
	path.join(out, "Stop-QA.cmd"),
	'@echo off\r\n> "%~dp0qa-app\\close.signal" echo stop\r\n',
);
await fs.writeFile(
	path.join(out, "README.txt"),
	"PurplePrint Studio isolated local QA (not an installer).\n" +
		"Not launched automatically. Run Launch-QA.cmd from your current desktop when ready.\n" +
		"Quit from the tray, or run Stop-QA.cmd to request a graceful quit of this QA only.\n" +
		"Stopping this app does not end any Computer Use session.\n" +
		"Profile: qa-app/qa-profile. No existing profile, login, conversation or private voice recording was copied.\n" +
		"Uses the local development node_modules junction; do not distribute this folder as an installer.\n" +
		"External voice/motion runtimes are not bundled or downloaded. No AI or generation runs during preparation.\n",
);
await fs.writeFile(
	path.join(out, "build-manifest.json"),
	JSON.stringify(
		{
			commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
			sourceStatus: execFileSync("git", ["status", "--porcelain=v1"], {
				cwd: repo,
				encoding: "utf8",
			}),
			repo,
			qa,
			copied,
			profileCopied: false,
			launched: false,
			computerUseStarted: false,
			narrationRuntimeConfigured: Boolean(runtime),
			hyperframesRuntimeConfigured: Boolean(hyperframes),
		},
		null,
		2,
	),
);
console.log(JSON.stringify({ qa, copiedFiles: copied.length, launched: false }));
