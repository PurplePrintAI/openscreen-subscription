// Opt-in local integration test. No AI, account, product website or real profile.
import fs from "node:fs/promises";
import path from "node:path";
import { DocumentService } from "../electron/ai-edition/document-service";
import { HyperframesService } from "../electron/hyperframes/service";

const option = (key: string) =>
	process.argv.find((arg) => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
const out = option("out");
const runtimeDir = option("runtime");
if (!out || !runtimeDir || !path.isAbsolute(out) || !path.isAbsolute(runtimeDir))
	throw new Error("Provide --out=absolute-new-QA-folder --runtime=absolute-tools/hyperframes");
await fs.mkdir(out, { recursive: false });
const docs = new DocumentService(path.join(out, "projects"), path.join(out, "recordings"));
const service = new HyperframesService({
	root: path.join(out, "motion-scenes"),
	runtimeDir,
	getDocument: (id) => docs.getProject(id),
	saveDocument: (doc) => docs.saveProject(doc),
});
let previous = "";
const poll = setInterval(
	() =>
		void service.status().then((status) => {
			if (status.phase !== previous) {
				previous = status.phase;
				console.log(status.phase);
			}
		}),
	1000,
);
try {
	const result = await service.render({
		title: "로컬 렌더링 연결 확인",
		eyebrow: "PURPLEPRINT STUDIO / RUNTIME TEST",
		subtitle: "데모·투어 준비 전, 설치와 Studio 편집 연결만 확인하는 테스트 장면입니다.",
		durationSec: 18,
	});
	await fs.writeFile(path.join(out, "validation.json"), JSON.stringify(result, null, 2));
	console.log(JSON.stringify(result, null, 2));
	if (result.phase !== "ready") process.exitCode = 1;
} finally {
	clearInterval(poll);
}
