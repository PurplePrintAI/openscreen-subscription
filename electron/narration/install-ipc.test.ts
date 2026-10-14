import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, expect, it, vi } from "vitest";
import { registerNarrationInstallIpc } from "./install-ipc";

const mocks = vi.hoisted(() => ({
	handle: vi.fn(),
	on: vi.fn(),
	quit: vi.fn(),
	status: vi.fn(async () => ({ phase: "idle" })),
	cancel: vi.fn(),
	close: vi.fn(),
	prepare: vi.fn(),
	install: vi.fn(),
	pick: vi.fn(),
}));
vi.mock("electron", () => ({
	app: {
		getPath: () => "profile",
		getAppPath: () => path.resolve("qa-app"),
		isPackaged: false,
		on: mocks.on,
		quit: mocks.quit,
	},
	ipcMain: { handle: mocks.handle },
	BrowserWindow: { fromWebContents: () => ({}) },
	dialog: { showOpenDialog: vi.fn() },
}));
vi.mock("./install-service", () => ({
	NarrationInstallService: class {
		status = mocks.status;
		cancel = mocks.cancel;
		close = mocks.close;
		prepare = mocks.prepare;
		install = mocks.install;
		pick = mocks.pick;
	},
}));
function event() {
	const frame = {
		url: pathToFileURL(path.resolve("qa-app/dist/index.html")).href + "?windowType=editor",
	};
	return { senderFrame: frame, sender: { id: 1, mainFrame: frame, once: vi.fn() } };
}
beforeEach(() => {
	vi.clearAllMocks();
	registerNarrationInstallIpc();
});
it("rejects foreign origins, subframes and requests lacking consent", async () => {
	const handler = mocks.handle.mock.calls[0][1],
		foreign = event(),
		child = event();
	foreign.senderFrame.url = "https://foreign.example";
	child.senderFrame = { ...child.senderFrame };
	await expect(handler(foreign, { action: "status" })).rejects.toThrow("Untrusted");
	await expect(handler(child, { action: "status" })).rejects.toThrow("Untrusted");
	await expect(handler(event(), { action: "plan", mode: "download" })).rejects.toThrow();
	expect(mocks.prepare).not.toHaveBeenCalled();
	expect(mocks.status).not.toHaveBeenCalled();
});
it("allows polling/cancellation during a long operation, rejects duplicate starts, and drains on quit", async () => {
	const handler = mocks.handle.mock.calls[0][1],
		sender = event();
	let finish: () => void = () => {
		throw new Error("Operation has not started");
	};
	mocks.prepare.mockImplementationOnce(
		() =>
			new Promise<void>((resolve) => {
				finish = resolve;
			}),
	);
	const pending = handler(sender, { action: "plan", mode: "download", trustPython: true });
	await handler(sender, { action: "status" });
	await handler(sender, { action: "cancel" });
	expect(mocks.cancel).toHaveBeenCalledWith(1);
	await expect(
		handler(sender, { action: "plan", mode: "download", trustPython: true }),
	).rejects.toThrow("busy");
	const preventDefault = vi.fn();
	mocks.on.mock.calls.find(([name]) => name === "before-quit")![1]({ preventDefault });
	expect(preventDefault).toHaveBeenCalled();
	expect(mocks.close).toHaveBeenCalledWith(1);
	expect(mocks.quit).not.toHaveBeenCalled();
	finish();
	await pending;
	await vi.waitFor(() => expect(mocks.quit).toHaveBeenCalledOnce());
});
it("closing the owner cancels its job", async () => {
	const sender = event();
	await mocks.handle.mock.calls[0][1](sender, { action: "status" });
	sender.sender.once.mock.calls[0][1]();
	expect(mocks.close).toHaveBeenCalledWith(1);
});
