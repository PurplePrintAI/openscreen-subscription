import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { statSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
	AiEditionLlmModelOption,
	AiEditionSubscriptionStatus,
} from "../../../src/native/contracts";
import { type EditorRuntimeTool, startEditorToolServer } from "./editor-tool-server";

type JsonObject = Record<string, unknown>;
const MINIMUM_VERSION = "2.1.238";
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

export interface ClaudeRun {
	model?: string;
	effort?: string;
	instructions: string;
	input: string;
	tools?: EditorRuntimeTool[];
	onText?: (text: string) => void;
	onThinking?: (text: string) => void;
	signal?: AbortSignal;
}

function object(value: unknown): JsonObject {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonObject)
		: {};
}

/** Display the resolved version while retaining the CLI's exact model-selection value. */
export function parseClaudeModels(value: unknown): AiEditionLlmModelOption[] {
	if (!Array.isArray(value)) throw new Error("Claude Code returned no model catalog.");
	const models = new Map<string, AiEditionLlmModelOption>();
	for (const entry of value.slice(0, 256)) {
		const item = object(entry);
		const id = typeof item.value === "string" ? item.value.trim() : "";
		const hasControlCharacter = [...id].some((character) => {
			const code = character.charCodeAt(0);
			return code < 32 || code === 127;
		});
		if (!id || id.length > 512 || hasControlCharacter || models.has(id)) continue;
		const nativeLabel = typeof item.displayName === "string" ? item.displayName.slice(0, 300) : id;
		const resolvedModel =
			typeof item.resolvedModel === "string" ? item.resolvedModel.slice(0, 512) : undefined;
		const version =
			/^claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?(?:\[1m\])?$/i.exec(
				resolvedModel ?? id,
			);
		let label = nativeLabel;
		if (version) {
			const family = version[1][0].toUpperCase() + version[1].slice(1);
			const name = `${family} ${version[2]}${version[3] ? `.${version[3]}` : ""}`;
			const context =
				/\[1m\]$/i.test(id) || /\[1m\]$/i.test(resolvedModel ?? "") ? " (1M context)" : "";
			label = id === "default" ? `${nativeLabel} · ${name}${context}` : `${name}${context}`;
		}
		models.set(id, {
			id,
			label,
			resolvedModel,
			...(typeof item.description === "string"
				? { description: item.description.slice(0, 2000) }
				: {}),
		});
	}
	if (!models.size)
		throw new Error(
			"Claude Code returned an empty model catalog. Check the CLI connection and model policy.",
		);
	return [...models.values()];
}

export function safeCliError(value: unknown): string {
	const text = value instanceof Error ? value.message : String(value);
	return text
		.replace(/sk-[a-z0-9_-]+/gi, "[redacted]")
		.replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
		.slice(0, 800);
}

/** Use the user's unmodified native CLI, never a shell command or an extracted token. */
export function findClaudeExecutable(
	env: Record<string, string | undefined> = process.env,
	platform = process.platform,
	arch = process.arch,
): string {
	const paths = platform === "win32" ? path.win32 : path.posix;
	const isFile = (candidate: string) => {
		try {
			return statSync(candidate).isFile();
		} catch {
			return false;
		}
	};
	const override = env.OPENSCREEN_CLAUDE_EXECUTABLE?.trim();
	if (override) {
		if (
			!paths.isAbsolute(override) ||
			/\.(cmd|bat|ps1|[cm]?js|sh)$/i.test(override) ||
			(platform === "win32" && !/\.exe$/i.test(override))
		) {
			throw new Error("OPENSCREEN_CLAUDE_EXECUTABLE must point to the native Claude executable.");
		}
		if (!isFile(override)) throw new Error("The configured Claude executable does not exist.");
		return override;
	}
	const filename = platform === "win32" ? "claude.exe" : "claude";
	const candidates = (env.PATH ?? env.Path ?? "")
		.split(platform === "win32" ? ";" : ":")
		.filter(Boolean)
		.map((directory) => paths.join(directory.replace(/^"|"$/g, ""), filename));
	const userDirectory = env.USERPROFILE ?? env.HOME;
	if (userDirectory) candidates.push(paths.join(userDirectory, ".local", "bin", filename));
	if (platform === "win32" && env.APPDATA) {
		const root = paths.join(env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code");
		candidates.push(paths.join(root, "bin", filename));
		candidates.push(
			paths.join(root, "node_modules", "@anthropic-ai", `claude-code-win32-${arch}`, filename),
		);
	}
	const found = candidates.find(isFile);
	if (!found)
		throw new Error("Install the official Claude Code CLI, then check the connection again.");
	return found;
}

export function parseClaudeStatus(value: unknown): AiEditionSubscriptionStatus {
	const status = object(value);
	const connected = status.loggedIn === true;
	const authMethod = typeof status.authMethod === "string" ? status.authMethod : undefined;
	const plan = typeof status.subscriptionType === "string" ? status.subscriptionType : undefined;
	return {
		available: true,
		connected,
		authMethod,
		plan,
		billing:
			authMethod === "claude.ai" && plan
				? "subscription"
				: authMethod === "api_key" || authMethod === "api-key"
					? "api"
					: "runtime",
		// Deliberately omit email, account IDs, and all credential-like fields.
		...(connected ? {} : { error: "Sign in using the official CLI: claude auth login" }),
	};
}

/** Captures only public output. Authentication and refresh stay entirely inside Claude Code. */
export class ClaudeCli {
	private children = new Set<ChildProcessWithoutNullStreams>();
	private cachedStatus?: { time: number; status: AiEditionSubscriptionStatus };
	private statusInFlight?: Promise<AiEditionSubscriptionStatus>;
	private modelsInFlight?: Promise<AiEditionLlmModelOption[]>;

	constructor(
		readonly workingDirectory: string,
		private readonly launch: typeof spawn = spawn,
		private readonly executable: () => string = findClaudeExecutable,
		private readonly timeoutMs = 180_000,
	) {}

	async status(force = false): Promise<AiEditionSubscriptionStatus> {
		if (!force && this.cachedStatus && Date.now() - this.cachedStatus.time < 15_000) {
			return this.cachedStatus.status;
		}
		if (this.statusInFlight) return this.statusInFlight;
		this.statusInFlight = this.readStatus().finally(() => {
			this.statusInFlight = undefined;
		});
		const status = await this.statusInFlight;
		this.cachedStatus = { time: Date.now(), status };
		return status;
	}

	private async readStatus(): Promise<AiEditionSubscriptionStatus> {
		try {
			await mkdir(this.workingDirectory, { recursive: true });
			const executable = this.executable();
			const version = await this.capture(
				executable,
				["--version"],
				this.workingDirectory,
				"",
				20_000,
			);
			const match = version.stdout.match(/\b(\d+)\.(\d+)\.(\d+)\b/);
			const parts = match?.slice(1).map(Number);
			const minimum = MINIMUM_VERSION.split(".").map(Number);
			const supported =
				(parts &&
					parts.some(
						(value, index) =>
							value > minimum[index] &&
							parts.slice(0, index).every((prefix, i) => prefix === minimum[i]),
					)) ||
				parts?.every((value, index) => value === minimum[index]);
			if (version.code !== 0 || !supported) {
				throw new Error(
					`Claude Code ${MINIMUM_VERSION} or later is required. Update the official CLI.`,
				);
			}
			const response = await this.capture(
				executable,
				["auth", "status"],
				this.workingDirectory,
				"",
				20_000,
			);
			const status = parseClaudeStatus(JSON.parse(response.stdout));
			if (response.code !== 0 && status.connected)
				throw new Error("Claude authentication check failed.");
			return status;
		} catch (error) {
			return { available: false, connected: false, error: safeCliError(error) };
		}
	}

	models(): Promise<AiEditionLlmModelOption[]> {
		if (!this.modelsInFlight)
			this.modelsInFlight = this.readModels().finally(() => {
				this.modelsInFlight = undefined;
			});
		return this.modelsInFlight;
	}

	private async readModels(): Promise<AiEditionLlmModelOption[]> {
		const status = await this.status();
		if (!status.connected) throw new Error(status.error ?? "Claude Code is not signed in.");
		const requestId = "openscreen-model-catalog";
		let catalog: AiEditionLlmModelOption[] | undefined;
		// The public SDK's initialize response includes ModelInfo[]. No user prompt,
		// completion, token extraction, or private provider endpoint is involved.
		const result = await this.capture(
			this.executable(),
			[
				"--print",
				"--input-format",
				"stream-json",
				"--output-format",
				"stream-json",
				"--verbose",
				"--safe-mode",
				"--tools",
				"",
				"--permission-mode",
				"dontAsk",
				"--no-session-persistence",
			],
			this.workingDirectory,
			`${JSON.stringify({
				type: "control_request",
				request_id: requestId,
				request: { subtype: "initialize", hooks: null, sdkMcpServers: [], skills: [] },
			})}\n`,
			Math.min(this.timeoutMs, 20_000),
			undefined,
			(event) => {
				if (event.type !== "control_response") return;
				const response = object(event.response);
				if (response.request_id !== requestId) return;
				if (response.subtype !== "success")
					throw new Error(
						`Claude model discovery failed: ${safeCliError(response.error ?? "initialization was refused")}`,
					);
				catalog = parseClaudeModels(object(response.response).models);
				return true;
			},
			true,
		);
		if (result.code !== 0 || !catalog)
			throw new Error("Claude Code did not finish model discovery. Retry the connection.");
		return catalog;
	}

	async run(request: ClaudeRun): Promise<string> {
		request.signal?.throwIfAborted();
		const status = await this.status(true);
		if (!status.connected) throw new Error(status.error ?? "Claude Code is not signed in.");
		request.signal?.throwIfAborted();
		const executable = this.executable();
		const turnDirectory = await mkdtemp(path.join(this.workingDirectory, "turn-"));
		let toolServer: Awaited<ReturnType<typeof startEditorToolServer>> | undefined;
		try {
			const tools = request.tools ?? [];
			if (tools.length) toolServer = await startEditorToolServer(tools);
			const promptPath = path.join(turnDirectory, "instructions.txt");
			const configPath = path.join(turnDirectory, "mcp.json");
			await writeFile(promptPath, request.instructions, { mode: 0o600 });
			await writeFile(
				configPath,
				JSON.stringify({ mcpServers: toolServer ? { openscreen: toolServer.config } : {} }),
				{ mode: 0o600 },
			);
			const args = [
				"--print",
				"--output-format",
				"stream-json",
				"--verbose",
				"--include-partial-messages",
				"--no-session-persistence",
				"--tools",
				"",
				"--permission-mode",
				"dontAsk",
				"--disable-slash-commands",
				"--no-chrome",
				"--setting-sources",
				"user",
				"--settings",
				JSON.stringify({ disableAllHooks: true, autoMemoryEnabled: false }),
				"--strict-mcp-config",
				"--mcp-config",
				configPath,
				"--system-prompt-file",
				promptPath,
			];
			if (request.model?.trim()) args.push("--model", request.model.trim());
			if (request.effort && ["low", "medium", "high", "xhigh"].includes(request.effort))
				args.push("--effort", request.effort);
			const expectedTools = tools.map((tool) => `mcp__openscreen__${tool.name}`);
			if (expectedTools.length) args.push("--allowedTools", expectedTools.join(","));
			let result: JsonObject | undefined;
			let streamedText = "";
			const response = await this.capture(
				executable,
				args,
				turnDirectory,
				request.input,
				this.timeoutMs,
				request.signal,
				(event) => {
					if (event.type === "system" && event.subtype === "init" && Array.isArray(event.tools)) {
						if (
							event.tools.some(
								(name) => name !== "EndConversation" && !expectedTools.includes(String(name)),
							)
						) {
							throw new Error(
								"Claude enabled tools outside the OpenScreen editor. Check your CLI managed configuration.",
							);
						}
						if (expectedTools.some((name) => !(event.tools as unknown[]).includes(name))) {
							throw new Error(
								"Claude could not load the OpenScreen editor tools. Check your CLI MCP policy and connection.",
							);
						}
					}
					if (event.type === "stream_event") {
						const delta = object(object(event.event).delta);
						if (delta.type === "text_delta" && typeof delta.text === "string") {
							streamedText += delta.text;
							request.onText?.(delta.text);
						} else if (delta.type === "thinking_delta" && typeof delta.thinking === "string") {
							request.onThinking?.(delta.thinking);
						}
					}
					if (event.type === "result") result = event;
				},
			);
			if (
				response.code !== 0 ||
				!result ||
				result.is_error === true ||
				result.subtype !== "success"
			) {
				const detail =
					result && Array.isArray(result.errors) ? result.errors.join("; ") : response.stderr;
				throw new Error(
					`Claude Code did not complete the request${detail ? `: ${safeCliError(detail)}` : "."}`,
				);
			}
			const text = typeof result.result === "string" ? result.result : "";
			if (!text.trim()) throw new Error("Claude Code returned no final response.");
			if (!streamedText) request.onText?.(text);
			return text;
		} finally {
			await toolServer?.close();
			await rm(turnDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
		}
	}

	private capture(
		executable: string,
		args: string[],
		cwd: string,
		input: string,
		timeoutMs: number,
		signal?: AbortSignal,
		onEvent?: (event: JsonObject) => void | boolean,
		keepInputOpen = false,
	): Promise<{ stdout: string; stderr: string; code: number | null }> {
		return new Promise((resolve, reject) => {
			signal?.throwIfAborted();
			// Do not replace CLAUDE_CONFIG_DIR, import tokens, or alter the CLI's authentication methods.
			const child = this.launch(executable, args, {
				cwd,
				env: { ...process.env },
				shell: false,
				windowsHide: true,
				stdio: "pipe",
			});
			this.children.add(child);
			let stdout = "";
			let stderr = "";
			let buffer = "";
			let bytes = 0;
			let settled = false;
			const cleanup = () => {
				clearTimeout(timer);
				signal?.removeEventListener("abort", abort);
			};
			const fail = (error: unknown) => {
				if (settled) return;
				settled = true;
				child.kill();
				cleanup();
				reject(error instanceof Error ? error : new Error(String(error)));
			};
			const abort = () => fail(new Error("Claude request was cancelled."));
			const timer = setTimeout(() => fail(new Error("Claude request timed out.")), timeoutMs);
			const parse = (line: string) => {
				if (!line.trim()) return;
				if (onEvent?.(object(JSON.parse(line))) === true) child.stdin.end();
			};
			child.stdout.setEncoding("utf8");
			child.stderr.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				if (settled) return;
				bytes += Buffer.byteLength(chunk);
				if (bytes > MAX_OUTPUT_BYTES)
					return fail(new Error("Claude response exceeded the output limit."));
				if (!onEvent) {
					stdout += chunk;
					return;
				}
				buffer += chunk;
				try {
					let newline = buffer.indexOf("\n");
					while (newline >= 0) {
						parse(buffer.slice(0, newline));
						buffer = buffer.slice(newline + 1);
						newline = buffer.indexOf("\n");
					}
				} catch (error) {
					fail(error);
				}
			});
			child.stderr.on("data", (chunk: string) => {
				stderr = (stderr + chunk).slice(-4000);
			});
			child.on("error", fail);
			child.stdin.on("error", fail);
			child.on("close", (code) => {
				this.children.delete(child);
				if (settled) return;
				try {
					if (onEvent) parse(buffer);
				} catch (error) {
					fail(error);
					return;
				}
				settled = true;
				cleanup();
				resolve({ stdout, stderr, code });
			});
			signal?.addEventListener("abort", abort, { once: true });
			if (signal?.aborted) abort();
			else if (keepInputOpen) child.stdin.write(input);
			else child.stdin.end(input);
		});
	}

	dispose(): void {
		for (const child of this.children) child.kill();
	}
}

let singleton: Promise<ClaudeCli> | undefined;
export function getClaudeCli(): Promise<ClaudeCli> {
	if (!singleton)
		singleton = import("electron").then(({ app }) => {
			const runtime = new ClaudeCli(path.join(app.getPath("userData"), "claude-workspace"));
			app.once("before-quit", () => runtime.dispose());
			return runtime;
		});
	return singleton;
}
