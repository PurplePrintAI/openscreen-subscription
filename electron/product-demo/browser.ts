import { randomUUID } from "node:crypto";
import { BrowserWindow, session } from "electron";
import { type FocusBounds, focusBoundsSchema } from "../../src/lib/demo-framing";
import { type DemoPage, type DemoTarget, productUrl } from "../../src/lib/product-demo";

export interface DemoBrowser {
	open(url: string): Promise<DemoPage>;
	apply(target: DemoTarget): Promise<void>;
	frame(): Promise<Buffer>;
	observeFocus(target: DemoTarget): Promise<FocusBounds | null>;
	close(): void;
}

// Runs in an isolated world, with DOM access only. No preload, filesystem, cookies,
// network APIs, user-supplied JS or arbitrary selectors are exposed to the planner.
export const inspectPageScript = `(() => {
	const clean = el => (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0,180);
	const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
	const stableHeading = el => {
		if (el.closest('[role="tabpanel"],article,[role="document"],[role="dialog"]')) return false;
		for(let parent=el.parentElement; parent && parent!==document.body; parent=parent.parentElement) {
			const css=getComputedStyle(parent);
			if (parent.scrollHeight > parent.clientHeight+32 && /auto|scroll|hidden/.test(css.overflowY)) return false;
		}
		return true;
	};
	const targets = [{id:0,kind:'top',text:document.title.slice(0,180),index:0}];
	for (const kind of ['heading','tab']) {
		const elements = [...document.querySelectorAll(kind === 'heading' ? 'h1,h2,h3' : '[role="tab"]')];
		const occurrences = new Map();
		elements.forEach(el => { const text=clean(el); if(visible(el) && text && (kind!=='heading' || stableHeading(el)) && targets.length < 100) {
			const index=occurrences.get(text)||0; occurrences.set(text,index+1); targets.push({id:targets.length,kind,text,index});
		} });
	}
	return {url:location.href,title:document.title.slice(0,180),text:document.body.innerText.slice(0,18000),targets};
})()`;

export function targetScript(target: DemoTarget): string {
	return `(() => {
		const target = ${JSON.stringify(target)};
		if(target.kind === 'top') { window.scrollTo({top:0,behavior:'smooth'}); return {ok:true}; }
		const selector = target.kind === 'heading' ? 'h1,h2,h3' : '[role="tab"]';
		const matches = [...document.querySelectorAll(selector)].filter(el => {
			const text = (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g, ' ').trim().slice(0,180);
			const r = el.getBoundingClientRect();
			return text === target.text && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
		});
		const el=matches[target.index];
		if (!el || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return {ok:false,error:'The page changed; target unavailable: '+target.text};
		// Scroll margin changes framing only, not the displayed product content.
		el.style.scrollMarginTop='96px';
		el.scrollIntoView({block:'start',behavior:'smooth'});
		if (target.kind === 'tab') el.click();
		return {ok:true};
	})()`;
}

/** Read-only geometry after navigation. Tabs focus their explicitly associated panel, not the tab label. */
export function focusScript(target: DemoTarget): string {
	return `(() => {
		const target = ${JSON.stringify(target)};
		if (target.kind === 'top') return null;
		const matches = [...document.querySelectorAll(target.kind === 'heading' ? 'h1,h2,h3' : '[role="tab"]')].filter(el => {
			const text = (el.innerText || el.getAttribute('aria-label') || '').replace(/\\s+/g,' ').trim().slice(0,180);
			const r = el.getBoundingClientRect();
			return text === target.text && r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
		});
		let el = matches[target.index];
		if (!el) return null;
		if (target.kind === 'tab') {
			const id = el.getAttribute('aria-controls');
			el = id && document.getElementById(id);
			if (!el || getComputedStyle(el).visibility === 'hidden') return null;
		}
		let r = el.getBoundingClientRect();
		if (target.kind === 'heading' && el.textContent?.trim()) {
			const range = document.createRange(); range.selectNodeContents(el);
			const textRect = range.getBoundingClientRect();
			if (textRect.width > 0 && textRect.height > 0) r = textRect;
		}
		if (r.width <= 0 || r.height <= 0 || r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight) return null;
		return {x:r.left/innerWidth,y:r.top/innerHeight,width:r.width/innerWidth,height:r.height/innerHeight};
	})()`;
}

export class ProductDemoBrowser implements DemoBrowser {
	private window: BrowserWindow | null = null;
	private origin = "";
	private lockedUrl: string | null = null;
	private fault: string | null = null;

	async open(input: string): Promise<DemoPage> {
		const url = productUrl(input);
		this.origin = new URL(url).origin;
		const isolated = session.fromPartition(`product-demo-${randomUUID()}`);
		isolated.setPermissionCheckHandler(() => false);
		isolated.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
		isolated.on("will-download", (event) => event.preventDefault());
		const win = new BrowserWindow({
			width: 1280,
			height: 720,
			useContentSize: true,
			resizable: false,
			show: false,
			title: "Product Demo — PurplePrint Studio",
			autoHideMenuBar: true,
			webPreferences: {
				session: isolated,
				nodeIntegration: false,
				contextIsolation: true,
				sandbox: true,
				webSecurity: true,
				devTools: false,
				backgroundThrottling: false,
			},
		});
		this.window = win;
		win.setMenu(null);
		win.webContents.on("page-title-updated", (event) => event.preventDefault());
		win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		const guard = (event: Electron.Event, next: string) => {
			try {
				const destination = new URL(productUrl(next));
				destination.hash = "";
				if (
					destination.origin === this.origin &&
					(!this.lockedUrl || destination.href === this.lockedUrl)
				)
					return;
			} catch {
				/* reject */
			}
			event.preventDefault();
			this.fault =
				"Navigation left the approved product origin. Open that URL as a separate production.";
		};
		win.webContents.on("will-navigate", guard);
		win.webContents.on("will-redirect", guard);
		win.webContents.on("will-attach-webview", (event) => event.preventDefault());
		win.webContents.on("render-process-gone", () => {
			this.fault = "The product browser stopped.";
		});
		win.showInactive();
		await win.loadURL(url);
		this.check();
		const loaded = new URL(win.webContents.getURL());
		loaded.hash = "";
		this.lockedUrl = loaded.href;
		return win.webContents.executeJavaScriptInIsolatedWorld(999, [{ code: inspectPageScript }]);
	}

	private check(): BrowserWindow {
		if (this.fault) throw new Error(this.fault);
		if (!this.window || this.window.isDestroyed())
			throw new Error("The product browser was closed.");
		if (new URL(this.window.webContents.getURL()).origin !== this.origin)
			throw new Error("Product origin changed.");
		const current = new URL(this.window.webContents.getURL());
		current.hash = "";
		if (this.lockedUrl && current.href !== this.lockedUrl)
			throw new Error("The page changed. Review a new shot plan.");
		return this.window;
	}

	async apply(target: DemoTarget): Promise<void> {
		const result = await this.check().webContents.executeJavaScriptInIsolatedWorld(999, [
			{ code: targetScript(target) },
		]);
		if (!result?.ok) throw new Error(result?.error || "Could not reach the planned product view.");
	}

	async frame(): Promise<Buffer> {
		const image = await this.check().webContents.capturePage(undefined, {
			stayHidden: true,
			stayAwake: true,
		});
		this.check();
		if (image.isEmpty()) throw new Error("The product browser returned an empty frame.");
		return image.resize({ width: 1280, height: 720, quality: "best" }).toJPEG(90);
	}

	async observeFocus(target: DemoTarget): Promise<FocusBounds | null> {
		const raw = await this.check().webContents.executeJavaScriptInIsolatedWorld(999, [
			{ code: focusScript(target) },
		]);
		this.check();
		const parsed = focusBoundsSchema.safeParse(raw);
		return parsed.success ? parsed.data : null;
	}

	close(): void {
		if (this.window && !this.window.isDestroyed()) this.window.destroy();
		this.window = null;
	}
}
