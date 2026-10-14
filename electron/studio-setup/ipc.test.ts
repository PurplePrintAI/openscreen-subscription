import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, expect, it, vi } from "vitest";
import { registerStudioSetupIpc } from "./ipc";

const mocks = vi.hoisted(() => ({
	handle: vi.fn(),
	status: vi.fn(async () => ({ marker: true })),
	reset: vi.fn(),
	pick: vi.fn(),
	save: vi.fn(),
	open: vi.fn(),
}));
vi.mock("electron", () => ({
	app: { getPath: () => "profile", getAppPath: () => path.resolve("qa-app"), isPackaged: false },
	ipcMain: { handle: mocks.handle },
	BrowserWindow: { fromWebContents: () => ({}) },
	dialog: { showOpenDialog: mocks.open },
}));
vi.mock("../ai-edition/claude/cli", () => ({ findClaudeExecutable: vi.fn() }));
vi.mock("../ai-edition/codex/app-server", () => ({ findCodexExecutable: vi.fn() }));
vi.mock("../media/audioPeaks", () => ({ resolveFfmpeg: vi.fn() }));
vi.mock("./service", () => ({
	StudioSetupService: class {
		status = mocks.status;
		reset = mocks.reset;
		pick = mocks.pick;
		save = mocks.save;
	},
}));
function event() {
	const frame = {
		url: pathToFileURL(path.resolve("qa-app/dist/index.html")).href + "?windowType=editor",
	};
	return {
		senderFrame: frame,
		sender: { id: 1, mainFrame: frame, once: vi.fn(), isDestroyed: () => false },
	};
}
beforeEach(() => {
	vi.clearAllMocks();
	registerStudioSetupIpc();
});
it("rejects subframes, foreign origins, renderer paths and absent consent before touching setup", async () => {
	const handler = mocks.handle.mock.calls[0][1];
	const child = event();
	child.senderFrame = { ...child.senderFrame };
	await expect(handler(child, { action: "status" })).rejects.toThrow("Untrusted");
	const foreign = event();
	foreign.senderFrame.url = "https://untrusted.example";
	await expect(handler(foreign, { action: "status" })).rejects.toThrow("Untrusted");
	await expect(
		handler(event(), { action: "pick", field: "pythonPath", path: "C:/injected.exe" }),
	).rejects.toThrow();
	await expect(handler(event(), { action: "save", kind: "narration" })).rejects.toThrow();
	expect(mocks.status).not.toHaveBeenCalled();
	expect(mocks.save).not.toHaveBeenCalled();
});
it("serializes repeated reset/status requests instead of racing the draft", async () => {
	const handler = mocks.handle.mock.calls[0][1],
		sender = event();
	const results = await Promise.all([
		handler(sender, { action: "reset" }),
		handler(sender, { action: "status" }),
	]);
	expect(results).toEqual([{ snapshot: { marker: true } }, { snapshot: { marker: true } }]);
	expect(mocks.reset).toHaveBeenCalledOnce();
	expect(mocks.status).toHaveBeenCalledTimes(2);
});
