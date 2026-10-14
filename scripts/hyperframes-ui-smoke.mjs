// Automated renderer/IPC integration; not a physical/manual native smoke test.
import fs from "node:fs/promises";
import path from "node:path";
import { expect } from "@playwright/test";
import { _electron as electron } from "playwright";

const option = (name) =>
	process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const appPath = option("app"),
	out = option("out"),
	runtime = option("runtime");
if (!appPath || !out || !runtime)
	throw new Error(
		"Provide --app=isolated-QA-folder --out=artifact-folder --runtime=tools/hyperframes",
	);
await fs.mkdir(out, { recursive: true });
const env = { ...process.env, STUDIO_HYPERFRAMES_RUNTIME_DIR: runtime };
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
			// Switching destroys the HUD; wait for its replacement below.
		});
	const editor = await opened;
	editor.on("pageerror", (err) => errors.push(err.message));
	await editor
		.getByRole("button", { name: "PurplePrint Studio", exact: true })
		.waitFor({ timeout: 30000 });
	const openDialog = async () => {
		await editor.getByRole("button", { name: "PurplePrint Studio", exact: true }).click();
		await editor.getByRole("menuitem", { name: /HyperFrames/ }).click();
		await editor.getByText(/Locally configured|로컬 구성 확인됨/).waitFor();
	};
	await openDialog();
	await editor.screenshot({ path: path.join(out, "motion-dialog.png") });
	const waitForRender = async (previousJobId) => {
		await expect
			.poll(
				async () => {
					const state = await editor.evaluate(() =>
						window.electronAPI.hyperframes({ action: "status" }),
					);
					return state.jobId === previousJobId ? "waiting" : state.phase;
				},
				{ timeout: 240000, intervals: [500, 1000, 1500] },
			)
			.toMatch(/^(ready|error|cancelled)$/);
		const state = await editor.evaluate(() => window.electronAPI.hyperframes({ action: "status" }));
		if (state.phase !== "ready") throw new Error(state.error || state.phase);
		return state;
	};
	await editor.getByLabel(/Duration \(seconds\)|길이 \(초\)/).fill("6");
	await editor.getByRole("button", { name: /Render locally|로컬 렌더링 →/ }).click();
	const diagnostic = await waitForRender();
	if (diagnostic.phase !== "ready") throw new Error(JSON.stringify(diagnostic));
	await editor.getByRole("button", { name: /Open in Studio|Studio에서 열기/ }).click();
	await editor.getByRole("dialog").waitFor({ state: "hidden" });
	await editor.locator('[data-clip-id="clip_motion"]').first().waitFor({ timeout: 30000 });
	await editor.screenshot({ path: path.join(out, "diagnostic-editor.png") });
	console.log("Diagnostic rendered and opened in Studio");
	await openDialog();
	const sourceSelect = editor.getByRole("combobox");
	await sourceSelect.selectOption("asset_motion");
	await editor.getByLabel(/^Title$|^제목$/).fill("Local source integration check");
	await editor.getByRole("button", { name: /Render locally|로컬 렌더링 →/ }).click();
	const source = await waitForRender(diagnostic.jobId);
	if (source.phase !== "ready" || source.projectId === diagnostic.projectId)
		throw new Error(JSON.stringify(source));
	await editor.getByRole("button", { name: /Open in Studio|Studio에서 열기/ }).click();
	await editor.getByRole("dialog").waitFor({ state: "hidden" });
	await editor.locator('[data-clip-id="clip_motion"]').first().waitFor({ timeout: 30000 });
	await editor.screenshot({ path: path.join(out, "source-editor.png") });
	await fs.writeFile(
		path.join(out, "ui-result.json"),
		JSON.stringify({ diagnostic, source, errors }, null, 2),
	);
	if (errors.length) throw new Error(errors.join("\n"));
	console.log("Existing asset composed into a separate Studio project; no renderer errors");
} catch (error) {
	await fs.writeFile(path.join(out, "ui-error.txt"), String(error));
	throw error;
} finally {
	await instance.close();
}
