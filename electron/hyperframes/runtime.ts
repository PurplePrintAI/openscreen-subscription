import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import {
	GSAP_VERSION,
	HYPERFRAMES_VERSION,
	type HyperframesRuntimeStatus,
} from "../../src/lib/hyperframes";

export interface RuntimePaths {
	runtimeDir: string;
	nodePath: string;
	browserPath: string;
	ffmpegPath: string;
	ffprobePath: string;
	cliPath: string;
	gsapPath: string;
}

export async function loadRuntime(runtimeDir: string): Promise<RuntimePaths> {
	const config = JSON.parse(
		await fs.readFile(path.join(runtimeDir, "local-runtime.json"), "utf8"),
	) as Record<string, unknown>;
	for (const key of ["nodePath", "browserPath", "ffmpegPath", "ffprobePath"] as const) {
		const value = config[key];
		if (typeof value !== "string" || !path.isAbsolute(value) || !(await fs.stat(value)).isFile())
			throw new Error(`Invalid ${key} in local-runtime.json`);
	}
	for (const [name, version] of [
		["hyperframes", HYPERFRAMES_VERSION],
		["gsap", GSAP_VERSION],
	]) {
		const pkg = JSON.parse(
			await fs.readFile(path.join(runtimeDir, "node_modules", name, "package.json"), "utf8"),
		);
		if (pkg.version !== version)
			throw new Error(`${name} must be pinned to ${version}, found ${pkg.version}.`);
	}
	const runtime = {
		runtimeDir,
		nodePath: config.nodePath as string,
		browserPath: config.browserPath as string,
		ffmpegPath: config.ffmpegPath as string,
		ffprobePath: config.ffprobePath as string,
		cliPath: path.join(runtimeDir, "node_modules", "hyperframes", "bin", "hyperframes.mjs"),
		gsapPath: path.join(runtimeDir, "node_modules", "gsap", "dist", "gsap.min.js"),
	};
	await fs.access(runtime.cliPath);
	await fs.access(runtime.gsapPath);
	return runtime;
}

export async function runtimeStatus(runtimeDir: string): Promise<HyperframesRuntimeStatus> {
	try {
		await loadRuntime(runtimeDir);
		return { available: true, version: HYPERFRAMES_VERSION, runtimeDir };
	} catch (error) {
		return {
			available: false,
			version: HYPERFRAMES_VERSION,
			runtimeDir,
			error: `HyperFrames runtime is not configured: ${error instanceof Error ? error.message : String(error)}`,
		};
	}
}

export function runtimeEnvironment(runtime: RuntimePaths, folder: string): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { APP_ROOT: "", VITE_PUBLIC: "" };
	for (const name of [
		"PATH",
		"Path",
		"PATHEXT",
		"SystemRoot",
		"SYSTEMROOT",
		"WINDIR",
		"COMSPEC",
		"TEMP",
		"TMP",
		"USERPROFILE",
		"HOME",
		"LOCALAPPDATA",
		"APPDATA",
		"LANG",
	]) {
		if (process.env[name]) env[name] = process.env[name];
	}
	return {
		...env,
		DO_NOT_TRACK: "1",
		HYPERFRAMES_NO_TELEMETRY: "1",
		HYPERFRAMES_NO_UPDATE_CHECK: "1",
		HYPERFRAMES_NO_AUTO_INSTALL: "1",
		HYPERFRAMES_BROWSER_PATH: runtime.browserPath,
		HYPERFRAMES_FFMPEG_PATH: runtime.ffmpegPath,
		HYPERFRAMES_FFPROBE_PATH: runtime.ffprobePath,
		HYPERFRAMES_EXTRACT_CACHE_DIR: path.join(folder, ".frame-cache"),
		HYPERFRAMES_FONT_CACHE_DIR: path.join(folder, ".font-cache"),
		CI: "1",
	};
}

/** Only kills the process tree created for this job. No shell, npx, global
 * installs, cloud commands or ambient API credentials in the render process. */
export async function runLocal(
	exe: string,
	args: string[],
	cwd: string,
	env: NodeJS.ProcessEnv,
	signal: AbortSignal,
	timeoutMs = 240_000,
): Promise<string> {
	signal.throwIfAborted();
	return new Promise((resolve, reject) => {
		const child = spawn(exe, args, {
			cwd,
			env,
			shell: false,
			windowsHide: true,
			detached: process.platform !== "win32",
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "",
			stderr = "",
			timedOut = false;
		const stop = () => {
			if (!child.pid || child.exitCode !== null) return;
			if (process.platform === "win32") {
				const killer = spawn(
					path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
					["/pid", String(child.pid), "/T", "/F"],
					{ shell: false, windowsHide: true, stdio: "ignore" },
				);
				killer.on("error", () => child.kill());
			} else {
				try {
					process.kill(-child.pid, "SIGTERM");
				} catch {
					child.kill();
				}
			}
		};
		const timer = setTimeout(() => {
			timedOut = true;
			stop();
		}, timeoutMs);
		signal.addEventListener("abort", stop, { once: true });
		if (signal.aborted) stop();
		child.stdout.on("data", (chunk: Buffer) => {
			stdout = (stdout + chunk.toString()).slice(-500_000);
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr = (stderr + chunk.toString()).slice(-20_000);
		});
		child.on("error", (error) => {
			clearTimeout(timer);
			signal.removeEventListener("abort", stop);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timer);
			signal.removeEventListener("abort", stop);
			if (signal.aborted) reject(new Error("Rendering cancelled."));
			else if (timedOut) reject(new Error("Local render timed out; its processes were stopped."));
			else if (code !== 0) reject(new Error(`Local command failed (${code}): ${stderr || stdout}`));
			else resolve(stdout);
		});
	});
}
