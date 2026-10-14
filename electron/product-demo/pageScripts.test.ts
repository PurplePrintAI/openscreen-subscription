// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
import { focusScript, inspectPageScript, targetScript } from "./browser";

vi.mock("electron", () => ({ BrowserWindow: vi.fn(), session: {} }));

beforeEach(() => {
	document.body.innerHTML =
		'<h1>Product</h1><h2>Benefits</h2><button role="tab">Features</button><button>Delete account</button><input type="password" value="secret">';
	Object.defineProperty(document.body, "innerText", {
		configurable: true,
		value: "Product Benefits Features Delete account",
	});
	vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
		width: 200,
		height: 50,
	} as DOMRect);
	Element.prototype.scrollIntoView = vi.fn();
	for (const el of document.querySelectorAll("h1,h2,button"))
		Object.defineProperty(el, "innerText", { configurable: true, value: el.textContent });
});

it("offers only observed headings and tabs, never form fields or arbitrary buttons", () => {
	const page = window.eval(inspectPageScript);
	expect(page.targets.map((t: { text: string }) => t.text)).toEqual([
		document.title,
		"Product",
		"Benefits",
		"Features",
	]);
	expect(page.text).not.toContain("secret");
	const click = vi.spyOn(document.querySelector<HTMLElement>('[role="tab"]')!, "click");
	window.eval(targetScript(page.targets[3]));
	expect(click).toHaveBeenCalledOnce();
});

it("rejects stale page targets instead of clicking an unrelated control", () => {
	const page = window.eval(inspectPageScript);
	Object.defineProperty(document.querySelector('[role="tab"]'), "innerText", {
		value: "Delete account",
	});
	expect(window.eval(targetScript(page.targets[3]))).toMatchObject({
		ok: false,
		error: expect.stringContaining("page changed"),
	});
});

it("keeps the same observed target when a tab inserts unrelated headings", () => {
	const page = window.eval(inspectPageScript);
	const target = page.targets.find((item: { text: string }) => item.text === "Benefits");
	const extra = document.createElement("h2");
	Object.defineProperty(extra, "innerText", { value: "Unrelated" });
	document.body.prepend(extra);
	expect(window.eval(targetScript(target))).toEqual({ ok: true });
});

it("does not plan deep report headings that disappear when tab panels change", () => {
	const article = document.createElement("article");
	const heading = document.createElement("h2");
	Object.defineProperty(heading, "innerText", { value: "Temporary report section" });
	article.append(heading);
	document.body.append(article);
	expect(
		window
			.eval(inspectPageScript)
			.targets.some((t: { text: string }) => t.text === "Temporary report section"),
	).toBe(false);
});

it("observes the actual associated panel without clicking and rejects offscreen geometry", () => {
	const tab = document.querySelector<HTMLElement>('[role="tab"]')!;
	const click = vi.spyOn(tab, "click");
	const target = { id: 3, kind: "tab" as const, text: "Features", index: 0 };
	expect(window.eval(focusScript(target))).toBeNull();
	tab.setAttribute("aria-controls", "features");
	const panel = document.createElement("section");
	panel.id = "features";
	document.body.append(panel);
	vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
		left: 200,
		top: 100,
		right: 500,
		bottom: 300,
		width: 300,
		height: 200,
	} as DOMRect);
	expect(window.eval(focusScript(target))).toEqual({
		x: 200 / innerWidth,
		y: 100 / innerHeight,
		width: 300 / innerWidth,
		height: 200 / innerHeight,
	});
	expect(click).not.toHaveBeenCalled();
	vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
		left: -20,
		top: 100,
		right: 500,
		bottom: 300,
		width: 520,
		height: 200,
	} as DOMRect);
	expect(window.eval(focusScript(target))).toBeNull();
});
