import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type { AxcutDocument } from "../../src/lib/ai-edition/schema";
import { getNarration, type NarrationExportRequest } from "../../src/lib/narration";
import { runLocal } from "../hyperframes/runtime";
import { narrationEnvironment } from "./service";

const approvedOutputs = new Map<number, { path: string; expires: number }>();
const pathKey = (value: string) =>
	process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);

/** Only the native Save dialog grants an output; the mixer cannot choose one. */
export function approveNarrationExport(senderId: number, output: string): void {
	approvedOutputs.delete(senderId);
	for (const [id, approval] of approvedOutputs)
		if (approval.expires < Date.now()) approvedOutputs.delete(id);
	if (path.isAbsolute(output) && path.extname(output).toLowerCase() === ".mp4")
		approvedOutputs.set(senderId, { path: pathKey(output), expires: Date.now() + 3600000 });
}
export function consumeNarrationExport(senderId: number, output: string): void {
	const approval = approvedOutputs.get(senderId);
	if (!approval || approval.expires < Date.now() || approval.path !== pathKey(output))
		throw new Error("Choose this export path in the Save dialog first.");
	approvedOutputs.delete(senderId);
}

interface Dependencies {
	ffmpeg: () => string | null;
	getDocument: (id: string) => Promise<AxcutDocument>;
	run?: typeof runLocal;
}

/** Native compositor exports always contain an AAC bed, including silent clips.
 * Copy video packets, mix on disk, verify, then atomically replace only the
 * approved output. Never replace it on a failed/cancelled mix. */
export async function mixNarrationExport(
	request: NarrationExportRequest,
	deps: Dependencies,
	signal: AbortSignal,
): Promise<void> {
	const ffmpeg = deps.ffmpeg();
	if (!ffmpeg)
		throw new Error("The bundled FFmpeg is unavailable. The original export is preserved.");
	const checkLayer = async () => {
		const doc = await deps.getDocument(request.projectId);
		const layer = getNarration(doc);
		if (!layer || JSON.stringify(layer) !== JSON.stringify(request.expectedLayer))
			throw new Error("Narration changed. Export the current project again.");
		if (doc.assets.some((asset) => pathKey(asset.originalPath) === pathKey(request.outputPath)))
			throw new Error("The narration mixer cannot replace a source recording.");
		return layer;
	};
	const layer = await checkLayer();
	if (
		!path.isAbsolute(request.outputPath) ||
		path.extname(request.outputPath).toLowerCase() !== ".mp4"
	)
		throw new Error("Expected a local MP4 export path.");
	if (path.extname(layer.audioPath).toLowerCase() !== ".wav")
		throw new Error("Expected the saved local WAV narration.");
	const original = await fs.lstat(request.outputPath);
	const voice = await fs.lstat(layer.audioPath);
	if (!original.isFile() || !voice.isFile() || original.isSymbolicLink() || voice.isSymbolicLink())
		throw new Error("Export and narration must be regular local files.");
	const folder = path.dirname(request.outputPath);
	const temporary = path.join(folder, `.studio-narration-${randomUUID()}.mp4`);
	const run = deps.run ?? runLocal;
	const env = narrationEnvironment();
	const filter =
		`[0:a:0]aresample=48000,volume=${layer.originalGain}[bed];` +
		`[1:a:0]aresample=48000,adelay=${Math.round(layer.offsetSec * 1000)}:all=1,apad[voice];` +
		"[bed][voice]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[mixed]";
	try {
		await run(
			ffmpeg,
			[
				"-v",
				"error",
				"-nostdin",
				"-n",
				"-protocol_whitelist",
				"file,pipe",
				"-i",
				request.outputPath,
				"-protocol_whitelist",
				"file,pipe",
				"-i",
				layer.audioPath,
				"-filter_complex",
				filter,
				"-map",
				"0:v:0",
				"-map",
				"[mixed]",
				"-c:v",
				"copy",
				"-c:a",
				"aac",
				"-b:a",
				"192k",
				"-ar",
				"48000",
				"-ac",
				"2",
				"-map_metadata",
				"0",
				"-movflags",
				"+faststart",
				"-shortest",
				temporary,
			],
			folder,
			env,
			signal,
		);
		if ((await fs.stat(temporary)).size < 1024) throw new Error("Narrated output is empty.");
		await run(
			ffmpeg,
			[
				"-v",
				"error",
				"-xerror",
				"-nostdin",
				"-protocol_whitelist",
				"file,pipe",
				"-i",
				temporary,
				"-f",
				"null",
				"-",
			],
			folder,
			env,
			signal,
		);
		await checkLayer();
		signal.throwIfAborted();
		const current = await fs.lstat(request.outputPath);
		if (
			!current.isFile() ||
			current.size !== original.size ||
			current.mtimeMs !== original.mtimeMs ||
			current.ino !== original.ino
		)
			throw new Error("Export changed while mixing. It was not replaced.");
		await fs.rename(temporary, request.outputPath);
	} finally {
		await fs.unlink(temporary).catch((error: NodeJS.ErrnoException) => {
			if (error.code !== "ENOENT")
				console.warn("Could not remove narration mix temporary file", error);
		});
	}
}
