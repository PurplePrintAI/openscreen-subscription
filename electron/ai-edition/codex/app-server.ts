import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { version } from "../../../package.json";
import { resolveCodexContextWindow } from "../../../src/lib/ai-edition/modelContextWindow";
import type { AiEditionLlmModelOption } from "../../../src/native/contracts";

type ObjectValue = Record<string, unknown>;
export interface CodexStatus {
	available: boolean;
	connected: boolean;
	email?: string;
	plan?: string;
	loginPending?: boolean;
	error?: string;
}
export interface CodexTool {
	name: string;
	description: string;
	inputSchema: ObjectValue;
	invoke: (args: ObjectValue) => Promise<string>;
}
export interface CodexRun {
	model?: string;
	effort?: string;
	instructions: string;
	input: string;
	tools?: CodexTool[];
	onText?: (text: string) => void;
	signal?: AbortSignal;
}
interface PendingRequest {
	resolve: (result: ObjectValue) => void;
	reject: (error: Error) => void;
	timer: ReturnType<typeof setTimeout>;
}
interface ActiveTurn {
	tools: Map<string, CodexTool>;
	onText?: (text: string) => void;
	text: string;
	turnId?: string;
	toolCalls: number;
	completed?: boolean;
	resolve: (text: string) => void;
	reject: (error: Error) => void;
}

function object(value: unknown): ObjectValue {
	return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : {};
}
function message(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

/** Resolve an actual executable; never pass prompts, JSON or model names through a shell. */
export function findCodexExecutable(
	env: NodeJS.ProcessEnv = process.env,
	platform = process.platform,
	arch = process.arch,
): string {
	const override = env.OPENSCREEN_CODEX_EXECUTABLE?.trim();
	if (override) {
		if (!path.isAbsolute(override) || /\.(cmd|bat|ps1)$/i.test(override)) {
			throw new Error("OPENSCREEN_CODEX_EXECUTABLE must point to the native Codex executable.");
		}
		if (!existsSync(override)) throw new Error("The configured Codex executable does not exist.");
		return override;
	}
	const filename = platform === "win32" ? "codex.exe" : "codex";
	const candidates = (env.PATH ?? env.Path ?? "")
		.split(path.delimiter)
		.filter(Boolean)
		.map((dir) => path.join(dir.replace(/^"|"$/g, ""), filename));
	if (platform === "win32" && env.APPDATA) {
		const triple = arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc";
		const root = path.join(env.APPDATA, "npm", "node_modules", "@openai", "codex");
		for (const base of [root, path.join(root, "node_modules", "@openai", `codex-win32-${arch}`)]) {
			for (const binDir of ["bin", "codex"]) {
				candidates.push(path.join(base, "vendor", triple, binDir, filename));
			}
		}
	}
	const found = candidates.find((candidate) => existsSync(candidate));
	if (!found)
		throw new Error("Codex CLI was not found. Install Codex CLI, then retry the connection.");
	return found;
}

/** App-owned auth profile. Tokens stay with the official CLI, never in renderer/API-key storage. */
export class CodexAppServer {
	private child: ChildProcessWithoutNullStreams | null = null;
	private starting: Promise<void> | null = null;
	private sequence = 0;
	private pending = new Map<number, PendingRequest>();
	private active = new Map<string, ActiveTurn>();
	private loginId: string | null = null;
	private loginError: string | undefined;

	constructor(
		readonly profileDir: string,
		private readonly launch: typeof spawn = spawn,
		private readonly executable: () => string = findCodexExecutable,
		private readonly requestTimeoutMs = 20_000,
		private readonly turnTimeoutMs = 180_000,
	) {}

	private async start(): Promise<void> {
		if (this.starting) return this.starting;
		if (this.child) return;
		this.starting = this.launchServer().finally(() => {
			this.starting = null;
		});
		return this.starting;
	}

	private async launchServer(): Promise<void> {
		const executable = this.executable();
		const cwd = path.join(this.profileDir, "workspace");
		await mkdir(cwd, { recursive: true });
		const env: NodeJS.ProcessEnv = { ...process.env, CODEX_HOME: this.profileDir };
		// A subscription selection must not silently bill an inherited API key.
		delete env.OPENAI_API_KEY;
		delete env.CODEX_API_KEY;
		const child = this.launch(executable, ["app-server", "--listen", "stdio://"], {
			cwd,
			env,
			windowsHide: true,
			shell: false,
			stdio: ["pipe", "pipe", "pipe"],
		}) as ChildProcessWithoutNullStreams;
		this.child = child;
		const lines = createInterface({ input: child.stdout });
		lines.on("line", (line) => {
			try {
				void this.receive(object(JSON.parse(line))).catch((error) => this.fail(error));
			} catch {
				this.fail(new Error("Codex returned invalid protocol data."));
			}
		});
		// Drain stderr, but never log raw auth URLs, tokens or provider responses.
		child.stderr.resume();
		child.stdin.on("error", (error) => {
			if (this.child === child) this.fail(error);
		});
		child.on("error", (error) => this.fail(error));
		child.on("exit", () => {
			lines.close();
			if (this.child === child)
				this.fail(new Error("Codex app-server stopped. Reconnect and retry."));
		});
		try {
			await this.request("initialize", {
				clientInfo: { name: "openscreen_subscription", title: "OpenScreen Subscription", version },
				capabilities: { experimentalApi: true },
			});
			this.send({ method: "initialized", params: {} });
		} catch (error) {
			this.fail(error);
			throw error;
		}
	}

	private send(payload: ObjectValue): void {
		if (!this.child || this.child.stdin.destroyed) throw new Error("Codex is not connected.");
		this.child.stdin.write(`${JSON.stringify(payload)}\n`);
	}
	private request(method: string, params: ObjectValue = {}): Promise<ObjectValue> {
		const id = ++this.sequence;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Codex ${method} timed out.`));
			}, this.requestTimeoutMs);
			this.pending.set(id, { resolve, reject, timer });
			try {
				this.send({ id, method, params });
			} catch (error) {
				clearTimeout(timer);
				this.pending.delete(id);
				reject(error);
			}
		});
	}

	private async receive(payload: ObjectValue): Promise<void> {
		if (payload.id !== undefined && typeof payload.method !== "string") {
			const pending = this.pending.get(Number(payload.id));
			if (!pending) return;
			clearTimeout(pending.timer);
			this.pending.delete(Number(payload.id));
			if (payload.error)
				pending.reject(new Error(String(object(payload.error).message ?? "Codex request failed.")));
			else pending.resolve(object(payload.result));
			return;
		}
		const params = object(payload.params);
		const threadId = String(params.threadId ?? "");
		const turn = this.active.get(threadId);
		if (payload.id !== undefined) {
			if (payload.method === "item/tool/call" && turn) {
				const tool = turn.tools.get(String(params.tool));
				let text = "Tool is not available in this OpenScreen turn.";
				let success = false;
				if (tool && ++turn.toolCalls <= 1000) {
					try {
						text = await tool.invoke(object(params.arguments));
						const result = object(JSON.parse(text));
						success = !result.error && result.ok !== false;
					} catch (error) {
						text = message(error);
					}
				}
				this.send({
					id: payload.id,
					result: { contentItems: [{ type: "inputText", text }], success },
				});
			} else {
				// No shell, file edits, remote MCP approvals or other vendor tools are approved here.
				this.send({
					id: payload.id,
					error: { code: -32601, message: "Only OpenScreen editor tools are supported." },
				});
			}
			return;
		}
		if (payload.method === "account/login/completed" && params.loginId === this.loginId) {
			this.loginId = null;
			this.loginError = params.success
				? undefined
				: String(params.error ?? "Sign-in did not finish.");
		}
		if (!turn) return;
		if (payload.method === "item/agentMessage/delta" && typeof params.delta === "string") {
			turn.text += params.delta;
			turn.onText?.(params.delta);
		} else if (payload.method === "turn/started") {
			turn.turnId = String(object(params.turn).id ?? "");
		} else if (payload.method === "turn/completed") {
			const completed = object(params.turn);
			turn.completed = true;
			if (completed.status === "completed") turn.resolve(turn.text);
			else
				turn.reject(
					new Error(String(object(completed.error).message ?? `Codex turn ${completed.status}.`)),
				);
		}
	}

	private fail(reason: unknown): void {
		const error = reason instanceof Error ? reason : new Error(String(reason));
		const child = this.child;
		this.child = null;
		this.loginId = null;
		for (const pending of this.pending.values()) {
			clearTimeout(pending.timer);
			pending.reject(error);
		}
		this.pending.clear();
		for (const turn of this.active.values()) turn.reject(error);
		this.active.clear();
		child?.kill();
	}
	close(): void {
		this.fail(new Error("OpenScreen closed the Codex connection."));
	}

	async status(): Promise<CodexStatus> {
		try {
			await this.start();
			const account = object((await this.request("account/read", { refreshToken: false })).account);
			return {
				available: true,
				connected: account.type === "chatgpt",
				...(typeof account.email === "string" ? { email: account.email } : {}),
				...(typeof account.planType === "string" ? { plan: account.planType } : {}),
				loginPending: Boolean(this.loginId),
				error: this.loginError,
			};
		} catch (error) {
			return { available: false, connected: false, error: message(error) };
		}
	}

	async login(): Promise<{ authUrl: string }> {
		await this.start();
		if (this.active.size)
			throw new Error("Wait for the active AI request before changing accounts.");
		await this.cancelLogin();
		this.loginError = undefined;
		const result = await this.request("account/login/start", { type: "chatgpt" });
		if (typeof result.loginId !== "string")
			throw new Error("Codex returned an invalid sign-in response.");
		this.loginId = result.loginId;
		try {
			const url = new URL(String(result.authUrl));
			if (
				url.protocol !== "https:" ||
				!["auth.openai.com", "chatgpt.com"].includes(url.hostname) ||
				url.username ||
				url.password ||
				url.port
			) {
				throw new Error("Codex returned an unexpected sign-in URL.");
			}
			return { authUrl: url.toString() };
		} catch (error) {
			await this.cancelLogin();
			throw error;
		}
	}
	async cancelLogin(): Promise<void> {
		if (!this.loginId) return;
		await this.request("account/login/cancel", { loginId: this.loginId });
		this.loginId = null;
	}
	async logout(): Promise<void> {
		await this.start();
		if (this.active.size) throw new Error("Wait for the active AI request before disconnecting.");
		await this.cancelLogin();
		await this.request("account/logout");
		this.loginError = undefined;
	}
	async models(): Promise<AiEditionLlmModelOption[]> {
		await this.start();
		const models: Array<AiEditionLlmModelOption & { default: boolean }> = [];
		const seen = new Set<string>();
		let cursor: string | undefined;
		do {
			const response = await this.request("model/list", {
				...(cursor ? { cursor } : {}),
				limit: 100,
			});
			for (const entry of Array.isArray(response.data) ? response.data : []) {
				const model = object(entry);
				if (!model.hidden && typeof model.model === "string") {
					const id = model.model;
					const reportedContext = [
						model.contextWindow,
						model.context_window,
						model.maxInputTokens,
						model.max_input_tokens,
					].find((value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0);
					const context =
						typeof reportedContext === "number"
							? { tokens: reportedContext, source: "runtime" as const }
							: resolveCodexContextWindow(id);
					models.push({
						id,
						label: typeof model.displayName === "string" ? model.displayName.slice(0, 300) : id,
						...(typeof model.description === "string"
							? { description: model.description.slice(0, 2000) }
							: {}),
						...(context
							? { contextWindowTokens: context.tokens, contextWindowSource: context.source }
							: {}),
						default: model.isDefault === true,
					});
				}
			}
			cursor = typeof response.nextCursor === "string" ? response.nextCursor : undefined;
			if (cursor) {
				if (seen.has(cursor) || seen.size >= 20)
					throw new Error("Codex model pagination did not finish.");
				seen.add(cursor);
			}
		} while (cursor);
		return models
			.sort((a, b) => Number(b.default) - Number(a.default))
			.map(({ default: _default, ...model }) => model);
	}

	async run(input: CodexRun): Promise<string> {
		if (input.signal?.aborted) throw new Error("AI request canceled.");
		const status = await this.status();
		if (!status.connected)
			throw new Error(status.error ?? "Connect your ChatGPT account in AI settings first.");
		const response = await this.request("thread/start", {
			...(input.model ? { model: input.model } : {}),
			cwd: path.join(this.profileDir, "workspace"),
			approvalPolicy: "never",
			sandbox: "read-only",
			ephemeral: true,
			environments: [],
			selectedCapabilityRoots: [],
			config: {
				web_search: "disabled",
				"features.shell_tool": false,
				"features.apply_patch_freeform": false,
				"apps._default.enabled": false,
			},
			baseInstructions: input.instructions,
			dynamicTools: (input.tools ?? []).map(({ name, description, inputSchema }) => ({
				type: "function",
				name,
				description,
				inputSchema,
			})),
		});
		const threadId = String(object(response.thread).id ?? "");
		if (!threadId) throw new Error("Codex did not create an AI session.");
		let timer: ReturnType<typeof setTimeout> | undefined;
		let abort: (() => void) | undefined;
		try {
			return await new Promise<string>((resolve, reject) => {
				const turn: ActiveTurn = {
					tools: new Map((input.tools ?? []).map((tool) => [tool.name, tool])),
					onText: input.onText,
					text: "",
					toolCalls: 0,
					resolve,
					reject,
				};
				this.active.set(threadId, turn);
				abort = () => reject(new Error("AI request canceled."));
				input.signal?.addEventListener("abort", abort, { once: true });
				if (input.signal?.aborted) {
					abort();
					return;
				}
				timer = setTimeout(
					() => reject(new Error("Codex AI request timed out. Please retry.")),
					this.turnTimeoutMs,
				);
				void this.request("turn/start", {
					threadId,
					input: [{ type: "text", text: input.input, text_elements: [] }],
					environments: [],
					...(input.effort && input.effort !== "none" ? { effort: input.effort } : {}),
				}).then((started) => {
					turn.turnId = String(object(started.turn).id ?? turn.turnId ?? "");
				}, reject);
			});
		} finally {
			if (timer) clearTimeout(timer);
			if (abort) input.signal?.removeEventListener("abort", abort);
			const active = this.active.get(threadId);
			this.active.delete(threadId);
			if (active?.turnId && !active.completed)
				await this.request("turn/interrupt", { threadId, turnId: active.turnId }).catch(() => {
					/* Already stopped or disconnected. */
				});
			await this.request("thread/unsubscribe", { threadId }).catch(() => {
				/* Ephemeral thread may already be gone. */
			});
		}
	}
}

let singleton: Promise<CodexAppServer> | undefined;
export async function getCodexAppServer(): Promise<CodexAppServer> {
	if (!singleton) {
		singleton = (async () => {
			const { app } = await import("electron");
			const runtime = new CodexAppServer(path.join(app.getPath("userData"), "codex-subscription"));
			app.once("before-quit", () => runtime.close());
			return runtime;
		})().catch((error) => {
			singleton = undefined;
			throw error;
		});
	}
	return singleton;
}
