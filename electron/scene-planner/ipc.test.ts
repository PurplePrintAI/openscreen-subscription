import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import type { LlmConfigStore } from "../ai-edition/llm-config-store";
import { registerScenePlannerIpc } from "./ipc";

const mocks = vi.hoisted(() => ({
	handle: vi.fn(),
	on: vi.fn(),
	cancel: vi.fn(),
	run: vi.fn().mockResolvedValue({ kind: "cancelled" }),
	trusted: vi.fn(() => true),
}));
vi.mock("electron", () => ({
	app: { getAppPath: () => "D:/qa", on: mocks.on },
	ipcMain: { handle: mocks.handle },
}));
vi.mock("../ipc/studioProductionSender", () => ({ isStudioProductionSender: mocks.trusted }));
vi.mock("./service", () => ({
	ScenePlannerService: class {
		handle = mocks.run;
		cancel = mocks.cancel;
	},
}));
it("requires trusted main-frame senders and cancels owned work on navigation/destruction/quit", async () => {
	registerScenePlannerIpc(() => ({}) as LlmConfigStore);
	const handle = mocks.handle.mock.calls[0][1] as (
		e: IpcMainInvokeEvent,
		raw: unknown,
	) => Promise<unknown>;
	const frame = { url: "file:///D:/qa/dist/index.html?windowType=editor" };
	const sender = { id: 1, mainFrame: frame, on: vi.fn(), once: vi.fn() };
	const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent;
	expect(() => handle({ ...event, senderFrame: {} } as IpcMainInvokeEvent, {})).toThrow(
		/Untrusted/,
	);
	mocks.trusted.mockReturnValue(false);
	expect(() => handle(event, {})).toThrow(/Untrusted/);
	expect(mocks.run).not.toHaveBeenCalled();
	mocks.trusted.mockReturnValue(true);
	await handle(event, { action: "info" });
	expect(mocks.run).toHaveBeenCalledOnce();
	const navigate = sender.on.mock.calls[0][1];
	navigate({}, "file:///other", false, false);
	expect(mocks.cancel).not.toHaveBeenCalled();
	navigate({}, "file:///other", false, true);
	expect(mocks.cancel).toHaveBeenCalledOnce();
	mocks.on.mock.calls[0][1]();
	sender.once.mock.calls[0][1]();
	expect(mocks.cancel).toHaveBeenCalledTimes(3);
});
