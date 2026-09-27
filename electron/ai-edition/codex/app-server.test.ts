import type { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexAppServer, findCodexExecutable } from "./app-server";

type Packet = {
	id?: number;
	method?: string;
	params?: Record<string, unknown>;
	result?: Record<string, unknown>;
	error?: unknown;
};
const cleanups: Array<() => void> = [];
afterEach(() => {
	for (const cleanup of cleanups.splice(0)) cleanup();
	vi.unstubAllEnvs();
});

function fixture(
	handle?: (packet: Packet, emit: (packet: Packet) => void) => boolean,
	timeout = 1000,
) {
	const parent = os.tmpdir();
	const profile = mkdtempSync(path.join(parent, "openscreen-codex-test-"));
	const sent: Packet[] = [];
	const stdout = new PassThrough();
	const emit = (packet: Packet) => stdout.write(`${JSON.stringify(packet)}\n`);
	const child = Object.assign(new EventEmitter(), {
		stdout,
		stderr: new PassThrough(),
		kill: vi.fn(),
		stdin: new Writable({
			write(chunk, _encoding, callback) {
				const packet: Packet = JSON.parse(String(chunk));
				sent.push(packet);
				queueMicrotask(() => {
					if (handle?.(packet, emit) || !packet.method || packet.id === undefined) return;
					let result: Record<string, unknown> = {};
					if (packet.method === "account/read")
						result = {
							account: { type: "chatgpt", email: "test@example.invalid", planType: "plus" },
						};
					if (packet.method === "thread/start") result = { thread: { id: "thread-1" } };
					emit({ id: packet.id, result });
				});
				callback();
			},
		}),
	});
	const launch = vi.fn(() => child);
	const runtime = new CodexAppServer(
		profile,
		launch as unknown as typeof spawn,
		() => "codex.exe",
		timeout,
		timeout,
	);
	cleanups.push(() => {
		runtime.close();
		stdout.end();
		child.stderr.end();
		if (
			path.dirname(profile) !== parent ||
			!path.basename(profile).startsWith("openscreen-codex-test-")
		)
			throw new Error("Unsafe test cleanup path");
		rmSync(profile, { recursive: true, force: true });
	});
	return { runtime, sent, emit, launch, profile, child };
}

describe("Codex app-server subscription transport", () => {
	it("finds a user-installed CLI when a Finder launch has an empty PATH", () => {
		const home = mkdtempSync(path.join(os.tmpdir(), "openscreen-codex-home-"));
		cleanups.push(() => rmSync(home, { recursive: true, force: true }));
		const executable = path.join(home, ".local", "bin", "codex");
		mkdirSync(path.dirname(executable), { recursive: true });
		writeFileSync(executable, "fixture");
		const posixHome = home.replace(/\\/g, "/");

		expect(findCodexExecutable({ HOME: posixHome, PATH: "" }, "darwin", "arm64")).toBe(
			`${posixHome}/.local/bin/codex`,
		);
	});

	it("isolates the profile, strips API billing credentials and initializes once", async () => {
		vi.stubEnv("OPENAI_API_KEY", "should-not-reach-subscription");
		vi.stubEnv("CODEX_API_KEY", "also-not-subscription");
		const f = fixture();
		const [a, b] = await Promise.all([f.runtime.status(), f.runtime.status()]);
		expect(a.connected && b.connected).toBe(true);
		expect(f.launch).toHaveBeenCalledTimes(1);
		const options = f.launch.mock.calls[0] as unknown as [
			string,
			string[],
			{ env: NodeJS.ProcessEnv; shell: boolean; windowsHide: boolean },
		];
		expect(options[2]).toMatchObject({ shell: false, windowsHide: true });
		expect(options[2].env.CODEX_HOME).toBe(f.profile);
		expect(options[2].env.OPENAI_API_KEY).toBeUndefined();
		expect(options[2].env.CODEX_API_KEY).toBeUndefined();
		expect(f.sent.filter((packet) => packet.method === "initialize")).toHaveLength(1);
	});

	it("does not present an API-key account as a connected subscription", async () => {
		const f = fixture((packet, emit) => {
			if (packet.method !== "account/read") return false;
			emit({ id: packet.id, result: { account: { type: "apiKey" } } });
			return true;
		});
		expect(await f.runtime.status()).toMatchObject({ available: true, connected: false });
		await expect(f.runtime.run({ instructions: "test", input: "hi" })).rejects.toThrow(
			"Connect your ChatGPT",
		);
		expect(f.sent.some((packet) => packet.method === "turn/start")).toBe(false);
	});

	it("returns model display metadata and verified context windows without starting a turn", async () => {
		const f = fixture((packet, emit) => {
			if (packet.method !== "model/list") return false;
			emit({
				id: packet.id,
				result: {
					data: [
						{
							model: "gpt-5.6-sol",
							displayName: "GPT-5.6 Sol",
							description: "Frontier model",
							isDefault: true,
						},
						{
							model: "runtime-model",
							displayName: "Runtime model",
							contextWindow: 321_000,
						},
						{ model: "gpt-6-luna", displayName: "6 Luna" },
						{ model: "gpt-6-astra", displayName: "Astra" },
						{ model: "gpt-6-sol", displayName: "6 Sol" },
						{ model: "hidden-model", hidden: true },
					],
				},
			});
			return true;
		});
		expect(await f.runtime.models()).toEqual([
			{
				id: "gpt-5.6-sol",
				label: "GPT-5.6 Sol",
				description: "Frontier model",
				contextWindowTokens: 1_050_000,
				contextWindowSource: "official",
			},
			{
				id: "gpt-6-sol",
				label: "GPT-6 Sol",
				contextWindowTokens: 1_050_000,
				contextWindowSource: "official",
			},
			{
				id: "gpt-6-astra",
				label: "GPT-6 Astra",
				contextWindowTokens: 1_050_000,
				contextWindowSource: "official",
			},
			{
				id: "gpt-6-luna",
				label: "GPT-6 Luna",
				contextWindowTokens: 1_050_000,
				contextWindowSource: "official",
			},
			{
				id: "runtime-model",
				label: "Runtime model",
				contextWindowTokens: 321_000,
				contextWindowSource: "runtime",
			},
		]);
		expect(f.sent.some((packet) => packet.method === "thread/start")).toBe(false);
	});

	it("cancels untrusted login URLs instead of opening them", async () => {
		const f = fixture((packet, emit) => {
			if (packet.method !== "account/login/start") return false;
			emit({
				id: packet.id,
				result: { loginId: "login-1", authUrl: "https://example.invalid/login" },
			});
			return true;
		});
		await expect(f.runtime.login()).rejects.toThrow("unexpected sign-in URL");
		expect(f.sent).toContainEqual(
			expect.objectContaining({ method: "account/login/cancel", params: { loginId: "login-1" } }),
		);
	});

	it("tracks managed login completion without accepting tokens from the renderer", async () => {
		const f = fixture((packet, emit) => {
			if (packet.method !== "account/login/start") return false;
			emit({
				id: packet.id,
				result: { loginId: "login-1", authUrl: "https://auth.openai.com/authorize" },
			});
			return true;
		});
		await f.runtime.login();
		expect(await f.runtime.status()).toMatchObject({ loginPending: true });
		f.emit({
			method: "account/login/completed",
			params: { loginId: "login-1", success: false, error: "Canceled in browser" },
		});
		expect(await f.runtime.status()).toMatchObject({
			loginPending: false,
			error: "Canceled in browser",
		});
		expect(f.sent.find((packet) => packet.method === "account/login/start")?.params).toEqual({
			type: "chatgpt",
		});
	});

	it("executes only declared editor tools, filters events and streams text", async () => {
		const invoke = vi.fn(async () => JSON.stringify({ ok: true }));
		const onText = vi.fn();
		const f = fixture((packet, emit) => {
			if (packet.method === "turn/start") {
				emit({ id: packet.id, result: { turn: { id: "turn-1" } } });
				emit({
					method: "item/agentMessage/delta",
					params: { threadId: "other-thread", delta: "ignore" },
				});
				emit({
					id: 1001,
					method: "item/tool/call",
					params: { threadId: "thread-1", tool: "addTrim", arguments: { startSec: 1 } },
				});
				return true;
			}
			if (packet.id === 1001) {
				emit({
					id: 1002,
					method: "item/tool/call",
					params: { threadId: "thread-1", tool: "shell", arguments: {} },
				});
				return true;
			}
			if (packet.id === 1002) {
				emit({
					method: "item/agentMessage/delta",
					params: { threadId: "thread-1", delta: "Done" },
				});
				emit({
					method: "turn/completed",
					params: { threadId: "thread-1", turn: { id: "turn-1", status: "completed" } },
				});
				return true;
			}
			return false;
		});
		expect(
			await f.runtime.run({
				instructions: "Only edit the video",
				input: "Trim",
				onText,
				tools: [{ name: "addTrim", description: "trim", inputSchema: { type: "object" }, invoke }],
			}),
		).toBe("Done");
		expect(invoke).toHaveBeenCalledExactlyOnceWith({ startSec: 1 });
		expect(onText).toHaveBeenCalledExactlyOnceWith("Done");
		expect(f.sent.find((packet) => packet.id === 1002)?.result?.success).toBe(false);
		expect(f.sent.find((packet) => packet.method === "thread/start")?.params).toMatchObject({
			environments: [],
			sandbox: "read-only",
			ephemeral: true,
		});
		expect(f.sent.some((packet) => packet.method === "thread/unsubscribe")).toBe(true);
		expect(f.sent.some((packet) => packet.method === "turn/interrupt")).toBe(false);
	});

	it("interrupts timed-out turns and releases their thread", async () => {
		const f = fixture((packet, emit) => {
			if (packet.method !== "turn/start") return false;
			emit({ id: packet.id, result: { turn: { id: "turn-hung" } } });
			return true;
		}, 25);
		await expect(f.runtime.run({ instructions: "test", input: "hi" })).rejects.toThrow("timed out");
		expect(f.sent).toContainEqual(
			expect.objectContaining({
				method: "turn/interrupt",
				params: { threadId: "thread-1", turnId: "turn-hung" },
			}),
		);
	});

	it("rejects pending requests when the local runtime exits", async () => {
		const f = fixture((packet) => packet.method === "account/read");
		const pending = f.runtime.status();
		await vi.waitFor(() =>
			expect(f.sent.some((packet) => packet.method === "account/read")).toBe(true),
		);
		f.child.emit("exit", 1);
		expect(await pending).toMatchObject({
			available: false,
			connected: false,
			error: expect.stringContaining("stopped"),
		});
	});
});
