import type { IpcMainInvokeEvent } from "electron";
import { expect, it, vi } from "vitest";
import { NARRATION_EXPORT_CHANNEL } from "../../src/lib/narration";
import type { DocumentService } from "../ai-edition/document-service";
import { registerNarrationIpc } from "./ipc";

const mocks = vi.hoisted(() => ({
	handle: vi.fn(),
	on: vi.fn(),
	consume: vi.fn(),
	mix: vi.fn(),
	trusted: vi.fn(() => true),
}));
vi.mock("electron", () => ({
	app: { getAppPath: () => "D:/qa", on: mocks.on },
	ipcMain: { handle: mocks.handle },
	BrowserWindow: {},
	dialog: {},
}));
vi.mock("../ipc/studioProductionSender", () => ({ isStudioProductionSender: mocks.trusted }));
vi.mock("../media/audioPeaks", () => ({ resolveFfmpeg: () => "ffmpeg" }));
vi.mock("./export", () => ({
	consumeNarrationExport: mocks.consume,
	mixNarrationExport: mocks.mix,
}));
it("guards native mixing, enforces one job and aborts owned work when its sender closes", async () => {
	registerNarrationIpc({ getProject: vi.fn() } as unknown as DocumentService);
	const handle = mocks.handle.mock.calls.find(
		([channel]) => channel === NARRATION_EXPORT_CHANNEL,
	)![1] as (event: IpcMainInvokeEvent, raw: unknown) => Promise<unknown>;
	const frame = { url: "file:///D:/qa/dist/index.html?windowType=editor" };
	const sender = { id: 41, mainFrame: frame, once: vi.fn(), removeListener: vi.fn() };
	const event = { sender, senderFrame: frame } as unknown as IpcMainInvokeEvent;
	const request = {
		projectId: "qa",
		outputPath: "C:/export.mp4",
		expectedLayer: {
			version: 1,
			projectId: "qa",
			jobId: "5a531c16-223a-4d12-9d9c-e79dc8aa7ad8",
			mode: "preset",
			text: "QA",
			audioPath: "C:/voice.wav",
			durationSec: 4,
			offsetSec: 0,
			originalGain: 0.4,
		},
	};
	await expect(
		handle({ ...event, senderFrame: {} } as IpcMainInvokeEvent, request),
	).rejects.toThrow("Untrusted");
	mocks.trusted.mockReturnValueOnce(false);
	await expect(handle(event, request)).rejects.toThrow("Untrusted");
	expect(mocks.mix).not.toHaveBeenCalled();
	let resolve!: () => void;
	mocks.mix.mockImplementationOnce(
		() =>
			new Promise<void>((done) => {
				resolve = done;
			}),
	);
	const pending = handle(event, request);
	expect(mocks.consume).toHaveBeenCalledWith(41, "C:/export.mp4");
	await expect(handle(event, request)).rejects.toThrow("already running");
	const signal = mocks.mix.mock.calls[0][2] as AbortSignal;
	sender.once.mock.calls[0][1]();
	expect(signal.aborted).toBe(true);
	resolve();
	await pending;
	expect(sender.removeListener).toHaveBeenCalled();
	mocks.consume.mockImplementationOnce(() => {
		throw new Error("Save dialog required");
	});
	await expect(handle(event, request)).rejects.toThrow("Save dialog");
	expect(mocks.mix).toHaveBeenCalledOnce();
});
