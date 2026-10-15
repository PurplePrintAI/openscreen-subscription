import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { Header } from "tar";
import { afterEach, expect, it } from "vitest";
import { extractPython, managedEnvironment, managedRuntimeManifest } from "./managed-runtime";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("managed-voice-"))
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture(
	entries: Array<{ path: string; type?: "File" | "SymbolicLink" | "Link"; content?: string }>,
) {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "managed-voice-"));
	roots.push(root);
	const blocks: Buffer[] = [];
	for (const entry of entries) {
		const body = Buffer.from(entry.content ?? "fixture");
		const header = new Header({
			path: entry.path,
			type: entry.type ?? "File",
			mode: 0o644,
			size: entry.type ? 0 : body.length,
			linkpath: entry.type ? "../../outside" : "",
		});
		header.encode();
		blocks.push(header.block!);
		if (!entry.type) blocks.push(body, Buffer.alloc((512 - (body.length % 512)) % 512));
	}
	blocks.push(Buffer.alloc(1024));
	const archive = path.join(root, "python.tar.gz");
	await fs.writeFile(archive, gzipSync(Buffer.concat(blocks)));
	const out = path.join(root, "out");
	await fs.mkdir(out);
	return { root, archive, out };
}
it("extracts only a bounded Python tree", async () => {
	const f = await fixture([{ path: "python/python.exe" }, { path: "python/Lib/valid.py" }]);
	await extractPython(f.archive, f.out, new AbortController().signal);
	expect(await fs.readFile(path.join(f.out, "python/python.exe"), "utf8")).toBe("fixture");
});
it.each([
	"../outside",
	"/python/outside",
	"python/../outside",
	"python/NUL.txt",
	"python/file:stream",
	"python/trailing.",
])("rejects unsafe archive path %s before writing", async (p) => {
	const f = await fixture([{ path: p }]);
	await expect(extractPython(f.archive, f.out, new AbortController().signal)).rejects.toThrow();
	expect(await fs.readdir(f.out)).toEqual([]);
});
it.each(["SymbolicLink", "Link"] as const)("rejects %s entries", async (type) => {
	const f = await fixture([{ path: "python/link", type }]);
	await expect(extractPython(f.archive, f.out, new AbortController().signal)).rejects.toThrow(
		"runtime-archive",
	);
	expect(await fs.readdir(f.out)).toEqual([]);
});
it("rejects case aliases and responds to abort", async () => {
	const f = await fixture([{ path: "python/file" }, { path: "python/FILE" }]);
	await expect(extractPython(f.archive, f.out, new AbortController().signal)).rejects.toThrow(
		"runtime-archive",
	);
	const abort = new AbortController();
	abort.abort();
	await expect(extractPython(f.archive, f.out, abort.signal)).rejects.toThrow();
});
it("pins a wheel-only package set and excludes source builds from end-user setup", () => {
	expect(managedRuntimeManifest.wheels.every((w) => w.filename.endsWith(".whl"))).toBe(true);
	expect(new Set(managedRuntimeManifest.wheels.map((w) => w.name)).size).toBe(
		managedRuntimeManifest.wheels.length,
	);
	expect(managedEnvironment(path.resolve("qa"))).toMatchObject({
		PYTHONNOUSERSITE: "1",
		PYTHONDONTWRITEBYTECODE: "1",
		HF_HUB_OFFLINE: "1",
	});
});
