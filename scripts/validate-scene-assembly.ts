// Prepare an isolated, offline QA fixture. This is not desktop interaction evidence.
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createEmptyDocument } from "../src/lib/ai-edition/schema";
import { assembleScenePlan, type ScenePlan, sceneReviewPlan } from "../src/lib/scene-plan";

const option = (key: string) =>
	process.argv.find((a) => a.startsWith(`--${key}=`))?.slice(key.length + 3);
const out = option("out"),
	source = option("source"),
	probe = option("ffprobe");
if (!out || !source || !probe || !path.isAbsolute(out) || !path.isAbsolute(source))
	throw new Error("Provide absolute --out, --source and --ffprobe paths.");
const info = JSON.parse(
	execFileSync(probe, ["-v", "error", "-show_streams", "-show_format", "-of", "json", source], {
		encoding: "utf8",
	}),
);
const video = info.streams.find((s: { codec_type: string }) => s.codec_type === "video");
const doc = createEmptyDocument({ projectId: "qa_source", title: "Scene assembly QA - isolated" });
doc.assets.push({
	id: "approved_footage",
	kind: "video",
	label: "Approved PurplePrint recording",
	originalPath: source,
	durationSec: Number(info.format.duration),
	video: { width: video.width, height: video.height, fps: 30, codec: video.codec_name },
	cameraTrack: null,
	transcriptionFailure: { kind: "no-audio", message: "Silent QA source" },
});
if (info.streams.some((s: { codec_type: string }) => s.codec_type === "audio"))
	throw new Error("Fixture expects the approved silent recording.");
const plan: ScenePlan = {
	version: 1,
	fps: 30,
	title: "PurplePrint 장면 조립 QA",
	keepNarration: false,
	scenes: [
		{
			id: "purpose",
			title: "누구의 문제를 풀 것인가",
			assetId: "approved_footage",
			inSec: 9,
			outSec: 15,
			caption: "누구의 어떤 문제를 풀 것인가",
			zoom: { scale: 1.5, cx: 0.7, cy: 0.4 },
		},
		{
			id: "decision",
			title: "승인한 결정",
			assetId: "approved_footage",
			inSec: 42,
			outSec: 48,
			caption: "승인한 결정이 설계로 남습니다",
			zoom: { scale: 1.5, cx: 0.7, cy: 0.4 },
		},
		{
			id: "document",
			title: "사용자 흐름",
			assetId: "approved_footage",
			inSec: 64,
			outSec: 70,
			caption: "사용자 흐름과 개발 기준까지",
			zoom: { scale: 1.5, cx: 0.7, cy: 0.4 },
		},
	],
};
const assembled = assembleScenePlan(plan, doc, "proj_scene_qa_source");
const projects = path.join(out, "qa-profile", "projects");
await fs.mkdir(projects, { recursive: true });
await fs.writeFile(
	path.join(projects, "proj_scene_qa_source.openscreen"),
	JSON.stringify(assembled, null, 2),
	{ flag: "wx" },
);
await fs.writeFile(path.join(out, "scene-plan-18s.json"), JSON.stringify(plan, null, 2));
await fs.writeFile(
	path.join(out, "review-plan-18s.json"),
	JSON.stringify(sceneReviewPlan(plan), null, 2),
);
console.log(
	JSON.stringify({
		fixture: projects,
		scenes: 3,
		frames: 540,
		source: { width: video.width, height: video.height },
	}),
);
