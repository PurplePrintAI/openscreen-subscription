// Opt-in real local-model service check. Use an isolated output root and runtime.
import fs from "node:fs/promises";
import path from "node:path";
import { NarrationService } from "../electron/narration/service";
import { NARRATION_TONE_PROMPTS, narrationToneInstruction } from "../src/lib/narration";

const option = (key: string) =>
	process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const out = option("out"),
	runtime = option("runtime"),
	scripts = option("scripts"),
	ffmpeg = option("ffmpeg");
if (
	!out ||
	!runtime ||
	!scripts ||
	!ffmpeg ||
	![out, runtime, scripts, ffmpeg].every(path.isAbsolute)
)
	throw Error("Provide absolute --out, --runtime, --scripts and --ffmpeg");
await fs.mkdir(out, { recursive: false });
const service = new NarrationService({
	root: out,
	runtimeFile: runtime,
	scriptDir: scripts,
	ffmpeg: () => ffmpeg,
});
const status = await service.status();
if (!status.runtime.available || !status.runtime.presetToneControl)
	throw Error(JSON.stringify(status.runtime));
const text =
	"퍼플프린트에서 아이디어를 설계로 구체화하세요. 무엇을 먼저 해야 할지, 근거와 함께 다음 단계를 찾아갑니다.";
const results = [];
for (const tone of [
	undefined,
	{ preset: "bright" as const, direction: "조금 더 천천히, 핵심 단어를 명확하게." },
]) {
	const result = await service.generate({
		mode: "preset",
		projectId: "qa_tone",
		text,
		...(tone ? { tone } : {}),
	});
	if (result.phase !== "ready" || !result.take) throw Error(JSON.stringify(result));
	const expected = tone ? narrationToneInstruction(tone) : NARRATION_TONE_PROMPTS.confident;
	const raw = JSON.parse(await fs.readFile(path.join(out, result.take.jobId, "raw.json"), "utf8"));
	if (raw.instruction !== expected) throw Error("Worker style mismatch");
	results.push(result.take);
	console.log(
		JSON.stringify({
			phase: "verified",
			tone: result.take.tone,
			duration: result.take.durationSec,
		}),
	);
}
await fs.writeFile(
	path.join(out, "validation.json"),
	JSON.stringify({ runtime: status.runtime, takes: results }, null, 2),
);
