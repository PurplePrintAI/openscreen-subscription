import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { extract, list } from "tar";
import { runLocal } from "../hyperframes/runtime";
import { downloadModelFile } from "./install-download";
import manifest from "./runtime-manifest.json";
import { narrationEnvironment } from "./service";

export const managedRuntimeManifest = manifest;
export const managedDownloadBytes =
	manifest.python.bytes +
	manifest.wheels.reduce((n, file) => n + ("bundled" in file ? 0 : file.bytes), 0);
export type RuntimeProgress = (
	step: "downloading-runtime" | "extracting-python" | "installing-packages",
	received?: number,
) => void;
export async function verifyRuntimeFile(
	file: string,
	bytes: number,
	digest: string,
	signal: AbortSignal,
) {
	if ((await fs.stat(file)).size !== bytes) throw new Error("runtime-integrity");
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(file, { signal, highWaterMark: 1024 * 1024 }))
		hash.update(chunk);
	if (hash.digest("hex") !== digest) throw new Error("runtime-integrity");
}

// Preflight and extraction both reject links, traversal, Windows device/ADS names and oversized payloads.
export async function extractPython(archive: string, destination: string, signal: AbortSignal) {
	let invalid = false,
		count = 0,
		total = 0;
	const seen = new Set<string>();
	await list({
		file: archive,
		strict: true,
		onReadEntry: (entry) => {
			const p = entry.path.replace(/\/$/, ""),
				parts = p.split("/");
			const safe =
				parts[0] === "python" &&
				parts.every(
					(s) =>
						!!s &&
						s !== "." &&
						s !== ".." &&
						![...s].some((c) => c.charCodeAt(0) < 32) &&
						!/[\\:<>|?*]/.test(s) &&
						!/[. ]$/.test(s) &&
						!/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(s),
				);
			const key = p.toLowerCase();
			count++;
			total += entry.size;
			if (
				!safe ||
				seen.has(key) ||
				!["File", "Directory"].includes(entry.type) ||
				entry.size > 64 * 1024 ** 2 ||
				total > 512 * 1024 ** 2 ||
				count > 25_000
			)
				invalid = true;
			seen.add(key);
		},
	});
	signal.throwIfAborted();
	if (invalid) throw new Error("runtime-archive");
	await extract({
		file: archive,
		cwd: destination,
		strict: true,
		preservePaths: false,
		filter: (_p, entry) =>
			!signal.aborted && "type" in entry && ["File", "Directory"].includes(entry.type),
	});
	signal.throwIfAborted();
}

export function managedEnvironment(root: string) {
	return {
		...narrationEnvironment(),
		PYTHONDONTWRITEBYTECODE: "1",
		PYTHONNOUSERSITE: "1",
		PIP_CONFIG_FILE: process.platform === "win32" ? "NUL" : "/dev/null",
		PIP_DISABLE_PIP_VERSION_CHECK: "1",
		TEMP: path.join(root, "temp"),
		TMP: path.join(root, "temp"),
		TORCH_HOME: path.join(root, "cache"),
		CUDA_CACHE_PATH: path.join(root, "cache", "cuda"),
	};
}
export async function installManagedRuntime(
	root: string,
	scriptDir: string,
	signal: AbortSignal,
	progress: RuntimeProgress,
) {
	const downloads = path.join(root, "downloads"),
		wheels = path.join(downloads, "wheels");
	await fs.mkdir(wheels, { recursive: true });
	await fs.mkdir(path.join(root, "temp"));
	let received = 0;
	progress("downloading-runtime", 0);
	const pythonArchive = path.join(downloads, manifest.python.filename);
	await downloadModelFile(
		manifest.python.url,
		pythonArchive,
		manifest.python.bytes,
		manifest.python.sha256,
		signal,
		(n) => progress("downloading-runtime", n),
		undefined,
		"runtime",
	);
	received += manifest.python.bytes;
	progress("extracting-python", received);
	await extractPython(pythonArchive, root, signal);
	for (const file of manifest.wheels) {
		signal.throwIfAborted();
		const target = path.join(wheels, file.filename);
		if ("bundled" in file) {
			await fs.copyFile(path.join(scriptDir, "vendor", file.filename), target, 1);
			await verifyRuntimeFile(target, file.bytes, file.sha256, signal);
		} else {
			await downloadModelFile(
				file.url,
				target,
				file.bytes,
				file.sha256,
				signal,
				(n) => progress("downloading-runtime", received + n),
				undefined,
				"runtime",
			);
			received += file.bytes;
		}
	}
	const requirements = path.join(downloads, "requirements.txt");
	await fs.writeFile(
		requirements,
		manifest.wheels.map((f) => `${f.name}==${f.version} --hash=sha256:${f.sha256}`).join("\n") +
			"\n",
		{ flag: "wx" },
	);
	const basePython = path.join(root, "python", "python.exe"),
		python = path.join(root, "venv", "Scripts", "python.exe"),
		env = managedEnvironment(root);
	progress("installing-packages", received);
	// A self-contained venv disables user/system site-packages for future narration too.
	await runLocal(
		basePython,
		["-I", "-m", "venv", path.join(root, "venv")],
		root,
		env,
		signal,
		120_000,
	);
	await runLocal(
		python,
		[
			"-I",
			"-m",
			"pip",
			"--isolated",
			"install",
			"--no-index",
			"--find-links",
			wheels,
			"--no-deps",
			"--only-binary=:all:",
			"--require-hashes",
			"--no-compile",
			"--no-cache-dir",
			"--disable-pip-version-check",
			"-r",
			requirements,
		],
		root,
		env,
		signal,
		15 * 60_000,
	);
	await runLocal(python, ["-I", "-m", "pip", "--isolated", "check"], root, env, signal, 60_000);
	// Retain wheel/license metadata inside site-packages; discard only this installation's downloads.
	if (path.dirname(downloads) !== root || path.basename(downloads) !== "downloads")
		throw new Error("runtime-cleanup");
	await fs.rm(downloads, { recursive: true, force: true });
	return python;
}

export interface VoiceHardware {
	name: string;
	memoryMiB: number;
	driver: string;
	compute: number;
}
export async function detectVoiceHardware(
	root: string,
	signal: AbortSignal,
): Promise<VoiceHardware> {
	if (process.platform !== "win32" || process.arch !== "x64") throw new Error("platform");
	const system = process.env.SystemRoot ?? "C:\\Windows";
	const candidates = [
		path.join(system, "System32", "nvidia-smi.exe"),
		path.join(
			process.env.ProgramFiles ?? "C:\\Program Files",
			"NVIDIA Corporation",
			"NVSMI",
			"nvidia-smi.exe",
		),
	];
	let exe: string | undefined;
	for (const candidate of candidates)
		if ((await fs.stat(candidate).catch(() => null))?.isFile()) {
			exe = candidate;
			break;
		}
	if (!exe) throw new Error("gpu");
	await fs.mkdir(root, { recursive: true });
	let output: string;
	try {
		output = await runLocal(
			exe,
			[
				"--query-gpu=name,memory.total,driver_version,compute_cap",
				"--format=csv,noheader,nounits",
				"--id=0",
			],
			root,
			narrationEnvironment(),
			signal,
			15_000,
		);
	} catch {
		throw new Error("gpu-diagnostic");
	}
	const [name, memory, driver, compute] = output
		.trim()
		.split(",")
		.map((s) => s.trim());
	const result = { name, memoryMiB: Number(memory), driver, compute: Number(compute) };
	if (
		!name ||
		!driver ||
		!Number.isFinite(result.memoryMiB) ||
		!Number.isFinite(result.compute) ||
		result.compute < 8 ||
		result.memoryMiB < 7680
	)
		throw new Error("gpu");
	return result;
}
