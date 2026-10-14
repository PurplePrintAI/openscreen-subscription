// Explicit, opt-in live integration exercise. Runs the SAME browser, planner,
// capture and document builder as the desktop feature, in a fresh QA profile.
// No native-input/UI smoke claim: this validates the producer pipeline only.

import { mkdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import { DocumentService } from "../electron/ai-edition/document-service";
import type { LlmConfig } from "../electron/ai-edition/llm-config-store";
import { resolveFfmpeg } from "../electron/media/audioPeaks";
import { ProductDemoBrowser } from "../electron/product-demo/browser";
import { subscriptionDemoPlanner } from "../electron/product-demo/planner-runtime";
import { ProductDemoService } from "../electron/product-demo/service";

const option = (key: string) =>
	process.argv.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const out = option("out");
const configPath = option("config");
if (!out || !path.isAbsolute(out) || !configPath || !option("url"))
	throw new Error(
		"Provide --out=absolute-folder --config=llm-config.json --url=https://product/ (uses model allowance).",
	);
mkdirSync(out, { recursive: true });
app.setPath("userData", path.join(out, "qa-profile"));
mkdirSync(app.getPath("userData"), { recursive: true });
app.on("window-all-closed", () => {
	/* Explicitly quit after the producer has saved its result. */
});
void app
	.whenReady()
	.then(async () => {
		const config = JSON.parse(await fs.readFile(configPath, "utf8")) as LlmConfig;
		// Codex uses Studio-owned auth, so a fresh profile cannot borrow it. Claude
		// manages its own auth externally; do not copy any credential files for QA.
		if (config.provider !== "claude-local")
			throw new Error(
				"This isolated live harness currently requires Claude local; test Codex through the desktop UI.",
			);
		const documents = new DocumentService(path.join(out, "projects"), path.join(out, "recordings"));
		const service = new ProductDemoService({
			root: out,
			createBrowser: () => new ProductDemoBrowser(),
			ffmpeg: () => resolveFfmpeg(),
			saveDocument: (doc) => documents.saveProject(doc),
			planner: subscriptionDemoPlanner(() => config),
		});
		let last = "";
		const poll = setInterval(() => {
			const state = service.status();
			const key = `${state.phase}:${state.sceneIndex}`;
			if (key !== last) {
				last = key;
				console.log(
					JSON.stringify({ phase: state.phase, scene: state.sceneIndex, count: state.sceneCount }),
				);
			}
		}, 1000);
		try {
			const review = await service.plan({
				url: option("url")!,
				product: "PurplePrint",
				maxSeconds: 150,
				language: "ko",
				intent:
					"퍼플프린트를 처음 접하는 비개발자·1인 창업자에게 기능과 가치를 보여주는 2분 안팎의 제품 소개 영상. 막연한 아이디어를 사용자의 문제, 실행 가능한 제품 설계, 검토와 다음 행동으로 구체화하는 흐름을 중심으로. 공개 페이지의 코칭·보고서 화면은 실제 신규 세션 결과가 아닌 예시라고 표시. 성과나 절감 수치, 실제 구현·배포를 보장하지 말 것.",
			});
			await fs.writeFile(path.join(out, "review.json"), JSON.stringify(review, null, 2));
			if (review.phase !== "review" || !review.plan || !review.jobId)
				throw new Error(review.error ?? "No valid plan.");
			// This harness has explicit shot-plan recording opt-in; otherwise it is plan-only.
			if (option("record") === "yes") {
				const result = await service.record(review.jobId, review.plan);
				await fs.writeFile(path.join(out, "result.json"), JSON.stringify(result, null, 2));
				if (result.phase !== "ready") throw new Error(result.error ?? "No completed draft.");
				console.log(JSON.stringify(result));
			}
		} catch (error) {
			console.error(error);
			process.exitCode = 1;
		} finally {
			clearInterval(poll);
			service.cancel();
			app.exit(Number(process.exitCode) || 0);
		}
	})
	.catch((error) => {
		console.error(error);
		app.exit(1);
	});
