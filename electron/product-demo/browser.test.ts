import path from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => {
	const listeners = new Map<string, (...args: unknown[]) => void>();
	let url = "https://example.com/";
	const contents = {
		on: vi.fn((name: string, fn: (...args: unknown[]) => void) => {
			listeners.set(name, fn);
		}),
		setWindowOpenHandler: vi.fn(),
		getURL: vi.fn(() => url),
		executeJavaScriptInIsolatedWorld: vi.fn(async () => ({
			url,
			title: "Product",
			text: "Product",
			targets: [],
		})),
		capturePage: vi.fn(async () => ({
			isEmpty: () => false,
			resize: () => ({ toJPEG: () => Buffer.alloc(128) }),
		})),
	};
	const win = {
		webContents: contents,
		setMenu: vi.fn(),
		showInactive: vi.fn(),
		loadURL: vi.fn(async (value: string) => {
			url = value;
		}),
		isDestroyed: vi.fn(() => false),
		destroy: vi.fn(),
	};
	const partition = {
		setPermissionCheckHandler: vi.fn(),
		setPermissionRequestHandler: vi.fn(),
		on: vi.fn(),
	};
	return {
		listeners,
		win,
		partition,
		ctor: vi.fn(function (_options: unknown) {
			return win;
		}),
		partitionFactory: vi.fn((_partition: string) => partition),
	};
});
vi.mock("electron", () => ({
	BrowserWindow: f.ctor,
	session: { fromPartition: f.partitionFactory },
	app: {},
	ipcMain: {},
}));

import { isStudioProductionSender } from "../ipc/studioProductionSender";
import { ProductDemoBrowser } from "./browser";

beforeEach(() => {
	vi.clearAllMocks();
	f.listeners.clear();
});

describe("isolated product browser", () => {
	it("has no Studio preload, user session, Node or permission grants", async () => {
		const browser = new ProductDemoBrowser();
		await browser.open("https://example.com/");
		const options = f.ctor.mock.calls[0] as unknown as [
			{ webPreferences: Record<string, unknown> },
		];
		expect(options[0].webPreferences).toMatchObject({
			nodeIntegration: false,
			contextIsolation: true,
			sandbox: true,
			webSecurity: true,
		});
		expect(options[0].webPreferences).not.toHaveProperty("preload");
		expect(f.partitionFactory.mock.calls[0]?.[0]).not.toMatch(/^persist:/);
		const deny = f.partition.setPermissionCheckHandler.mock.calls[0][0];
		expect(deny()).toBe(false);
		const popup = f.win.webContents.setWindowOpenHandler.mock.calls[0][0];
		expect(popup()).toEqual({ action: "deny" });
		browser.close();
		expect(f.win.destroy).toHaveBeenCalled();
	});
	it("blocks same-origin document changes as well as external redirects after inspection", async () => {
		const browser = new ProductDemoBrowser();
		await browser.open("https://example.com/");
		const event = { preventDefault: vi.fn() };
		f.listeners.get("will-navigate")?.(event, "https://example.com/#features");
		expect(event.preventDefault).not.toHaveBeenCalled();
		f.listeners.get("will-redirect")?.(event, "https://other.example/login");
		expect(event.preventDefault).toHaveBeenCalled();
		await expect(browser.frame()).rejects.toThrow("Navigation");
	});
	it("does not allow a product page or another local file to call production IPC", () => {
		const root = path.resolve("studio-test-app");
		expect(isStudioProductionSender("https://example.com/", root)).toBe(false);
		expect(isStudioProductionSender(pathToFileURL(path.join(root, "other.html")).href, root)).toBe(
			false,
		);
		expect(
			isStudioProductionSender(pathToFileURL(path.join(root, "dist", "index.html")).href, root),
		).toBe(true);
		expect(
			isStudioProductionSender("http://localhost:5173/", "/app", "http://localhost:5173"),
		).toBe(true);
		expect(
			isStudioProductionSender("http://localhost:5174/", "/app", "http://localhost:5173"),
		).toBe(false);
	});
});
