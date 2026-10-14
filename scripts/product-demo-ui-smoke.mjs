// Automated renderer/IPC test, not a physical-input/manual native smoke test.
import fs from "node:fs/promises";
import path from "node:path";
import { _electron as electron } from "playwright";

const option = (name) =>
	process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const appPath = option("app");
const out = option("out");
if (!appPath || !out) throw new Error("Pass --app=isolated-QA-app-folder --out=artifact-folder");
await fs.mkdir(out, { recursive: true });
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const instance = await electron.launch({ args: [appPath], env, timeout: 60000 });
const errors = [];
try {
	const hud = await instance.firstWindow();
	await hud.waitForFunction(() => Boolean(window.electronAPI?.switchToEditor), { timeout: 30000 });
	const opened = instance.waitForEvent("window", { timeout: 30000 });
	await hud
		.evaluate(() => window.electronAPI.switchToEditor())
		.catch(() => {
			// The real switch destroys the HUD; wait for the replacement editor below.
		});
	const editor = await opened;
	editor.on("pageerror", (error) => errors.push(error.message));
	await editor
		.getByRole("button", { name: "PurplePrint Studio", exact: true })
		.waitFor({ timeout: 30000 });
	await editor.getByRole("button", { name: "PurplePrint Studio", exact: true }).click();
	await editor.getByRole("menuitem", { name: /Create product demo|제품 소개 영상 만들기/ }).click();
	await editor.getByRole("dialog").waitFor();
	const status = await editor.evaluate(() => window.electronAPI.productDemo({ action: "status" }));
	if (status.phase !== "idle")
		throw new Error(`Unexpected initial production status ${status.phase}`);
	await editor.screenshot({ path: path.join(out, "production-dialog.png") });
	await editor
		.getByRole("dialog")
		.getByRole("button", { name: /^Close$|^닫기$/ })
		.click();
	if (option("title")) {
		await editor.getByRole("button", { name: /^Open project$|^프로젝트 열기$/i }).click();
		await editor.getByRole("dialog").getByText(option("title"), { exact: true }).click();
		await editor.getByRole("dialog").waitFor({ state: "hidden" });
		if (option("clips")) {
			await editor.waitForFunction(
				(expected) =>
					new Set(
						Array.from(document.querySelectorAll("[data-clip-id]")).map((el) =>
							el.getAttribute("data-clip-id"),
						),
					).size === expected,
				Number(option("clips")),
			);
		}
		await editor.screenshot({ path: path.join(out, "draft-editor.png") });
	}
	await fs.writeFile(
		path.join(out, "ui-result.json"),
		JSON.stringify(
			{
				status,
				errors,
				loadedProjectTitle: option("title") ?? null,
				expectedClips: option("clips") ? Number(option("clips")) : null,
			},
			null,
			2,
		),
	);
	if (errors.length) throw new Error(errors.join("\n"));
	console.log(
		`Product demo menu, dialog and trusted IPC passed${option("title") ? "; saved draft opened" : ""}.`,
	);
} finally {
	await instance.close();
}
