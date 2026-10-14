// Opt-in real local-model integration; never uses the installed profile or uploads audio.
import fs from "node:fs/promises";
import path from "node:path";
import { NarrationService } from "../electron/narration/service";

const option = (key: string) =>
	process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const root = option("out"),
	runtimeFile = option("runtime"),
	reference = option("reference"),
	ffmpeg = option("ffmpeg");
if (
	!root ||
	!runtimeFile ||
	!reference ||
	!ffmpeg ||
	![root, runtimeFile, reference, ffmpeg].every(path.isAbsolute)
)
	throw new Error(
		"Pass absolute --out, --runtime, --reference, --ffmpeg paths; use an authorized reference.",
	);
await fs.mkdir(root, { recursive: false });
const service = new NarrationService({
	root,
	runtimeFile,
	scriptDir: path.resolve("tools/narration"),
	ffmpeg: () => ffmpeg,
});
const text = "퍼플프린트에서 아이디어를 설계로 구체화하세요.";
const preset = await service.generate({ mode: "preset", projectId: "qa", text });
if (preset.phase !== "ready") throw new Error(JSON.stringify(preset));
console.log("Preset generation and decode passed");
const prepared = await service.prepareReference(reference);
if (!prepared.reference) throw new Error(JSON.stringify(prepared));
console.log("Local reference conversion and transcription passed");
const cloned = await service.generate({
	mode: "clone",
	projectId: "qa",
	text,
	referenceId: prepared.reference.id,
	referenceText: prepared.reference.text,
	speakerConsent: true,
});
if (cloned.phase !== "ready") throw new Error(JSON.stringify(cloned));
console.log("Clone generation and decode passed");
const pending = service.generate({ mode: "preset", projectId: "qa", text });
await new Promise((resolve) => setTimeout(resolve, 800));
service.cancel();
const cancelled = await pending;
if (cancelled.phase !== "cancelled" || cancelled.take)
	throw new Error("Cancellation did not clear the take");
await fs.writeFile(
	path.join(root, "validation.json"),
	JSON.stringify({ preset, cloned, cancelled, captureDate: "2026-10-11" }, null, 2),
);
console.log("Owned-process cancellation passed");
