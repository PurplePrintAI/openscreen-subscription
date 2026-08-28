import { type ChildProcessWithoutNullStreams, type spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeCli, findClaudeExecutable, parseClaudeStatus, safeCliError } from "./cli";

const directories: string[] = [];
afterEach(async () => {
	vi.unstubAllEnvs();
	for (const directory of directories.splice(0))
		await rm(directory, { recursive: true, force: true });
});
async function directory() {
	const value = await mkdtemp(path.join(os.tmpdir(), "openscreen-claude-test-"));
	directories.push(value);
	return value;
}
type FakeChild = ChildProcessWithoutNullStreams & {
	stdout: PassThrough;
	stderr: PassThrough;
	stdin: PassThrough;
};
function fakeChild() {
	const child = new EventEmitter() as FakeChild;
	child.stdout = new PassThrough();
	child.stderr = new PassThrough();
	child.stdin = new PassThrough();
	child.kill = vi.fn(() => {
		queueMicrotask(() => child.emit("close", null));
		return true;
	});
	return child;
}
function launcher(
	run: (child: FakeChild, args: string[]) => void,
	status: unknown = { loggedIn: true, authMethod: "claude.ai", subscriptionType: "max" },
) {
	const children: ChildProcessWithoutNullStreams[] = [];
	const launch = vi.fn((_executable: string, args: string[]) => {
		const child = fakeChild();
		children.push(child);
		queueMicrotask(() => {
			if (args[0] === "--version") child.stdout.write("2.1.238 (Claude Code)\n");
			else if (args[0] === "auth") child.stdout.write(JSON.stringify(status, null, 2));
			else {
				run(child, args);
				return;
			}
			child.emit("close", 0);
		});
		return child;
	});
	return { launch: launch as unknown as typeof spawn, spy: launch, children };
}
const request = {
	model: "sonnet",
	instructions: "Use only the supplied context.",
	input: "한글 입력",
};

describe("Claude local runtime", () => {
	it("keeps credential-like fields out of connection metadata and distinguishes API billing", () => {
		expect(
			parseClaudeStatus({
				loggedIn: true,
				authMethod: "claude.ai",
				subscriptionType: "max",
				accessToken: "secret",
				email: "private@example.com",
			}),
		).toEqual({
			available: true,
			connected: true,
			authMethod: "claude.ai",
			plan: "max",
			billing: "subscription",
		});
		expect(parseClaudeStatus({ loggedIn: true, authMethod: "api_key" }).billing).toBe("api");
		expect(parseClaudeStatus({ loggedIn: false }).connected).toBe(false);
		expect(safeCliError("sk-ant-private-secret Bearer private-token")).not.toMatch(/private/);
	});

	it("accepts a native override and rejects command wrappers", async () => {
		const base = await directory();
		const executable = path.join(base, "claude.exe");
		await writeFile(executable, "fixture");
		expect(findClaudeExecutable({ OPENSCREEN_CLAUDE_EXECUTABLE: executable })).toBe(executable);
		expect(() =>
			findClaudeExecutable({ OPENSCREEN_CLAUDE_EXECUTABLE: path.join(base, "claude.cmd") }),
		).toThrow("native");
		expect(() => findClaudeExecutable({ OPENSCREEN_CLAUDE_EXECUTABLE: "relative/claude" })).toThrow(
			"native",
		);
	});

	it("streams UTF-8 JSONL without duplicate final text and preserves CLI-owned authentication", async () => {
		vi.stubEnv("ANTHROPIC_API_KEY", "user-owned-key");
		vi.stubEnv("CLAUDE_CONFIG_DIR", "user-owned-profile");
		const launched = launcher((child) => {
			const events = [
				{ type: "system", subtype: "init", tools: [] },
				{ type: "stream_event", event: { delta: { type: "thinking_delta", thinking: "검토" } } },
				{ type: "stream_event", event: { delta: { type: "text_delta", text: "안녕" } } },
				{ type: "result", subtype: "success", is_error: false, result: "안녕" },
			]
				.map((event) => JSON.stringify(event))
				.join("\n");
			const bytes = Buffer.from(events);
			for (let offset = 0; offset < bytes.length; offset += 5)
				child.stdout.write(bytes.subarray(offset, offset + 5));
			child.emit("close", 0);
		});
		const root = await directory();
		const runtime = new ClaudeCli(root, launched.launch, () => "claude-native");
		const onText = vi.fn();
		const onThinking = vi.fn();
		expect(await runtime.run({ ...request, onText, onThinking })).toBe("안녕");
		expect(onText.mock.calls).toEqual([["안녕"]]);
		expect(onThinking.mock.calls).toEqual([["검토"]]);
		const call = vi.mocked(launched.launch).mock.calls.at(-1)!;
		expect(call[1]).toContain("--no-session-persistence");
		expect(call[1]).not.toContain("--dangerously-skip-permissions");
		expect(call[2]).toMatchObject({
			shell: false,
			windowsHide: true,
			env: { ANTHROPIC_API_KEY: "user-owned-key", CLAUDE_CONFIG_DIR: "user-owned-profile" },
		});
		expect(await readdir(root)).toEqual([]);
	});

	it.each([
		"failure",
		"unexpected-tools",
		"missing-result",
		"timeout",
	])("rejects %s instead of claiming success", async (mode) => {
		const launched = launcher((child) => {
			if (mode === "timeout") return;
			const event =
				mode === "unexpected-tools"
					? { type: "system", subtype: "init", tools: ["Bash"] }
					: mode === "failure"
						? {
								type: "result",
								subtype: "error_during_execution",
								is_error: true,
								errors: ["sk-ant-private"],
							}
						: { type: "system" };
			child.stdout.write(`${JSON.stringify(event)}\n`);
			child.emit("close", 0);
		});
		const root = await directory();
		const runtime = new ClaudeCli(root, launched.launch, () => "claude-native", 20);
		await expect(runtime.run(request)).rejects.toThrow();
		expect(await readdir(root)).toEqual([]);
	});

	it("does not start inference when logged out, and cancels an owned child", async () => {
		const loggedOut = launcher(
			() => {
				throw new Error("Must not run");
			},
			{ loggedIn: false },
		);
		const runtime = new ClaudeCli(await directory(), loggedOut.launch, () => "claude-native");
		await expect(runtime.run(request)).rejects.toThrow("claude auth login");
		expect(loggedOut.spy).toHaveBeenCalledTimes(2);
		const controller = new AbortController();
		const launched = launcher(() => controller.abort());
		const connected = new ClaudeCli(await directory(), launched.launch, () => "claude-native");
		await expect(connected.run({ ...request, signal: controller.signal })).rejects.toThrow(
			"cancelled",
		);
		expect(launched.children.at(-1)?.kill).toHaveBeenCalled();
	});
});
