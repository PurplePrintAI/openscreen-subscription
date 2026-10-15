import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { downloadModelFile } from "./install-download";

const roots: string[] = [];
afterEach(async () => {
	for (const root of roots.splice(0)) {
		if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith("voice-download-"))
			throw new Error("Unsafe cleanup");
		await fs.rm(root, { recursive: true, force: true });
	}
});
async function fixture() {
	const root = await fs.mkdtemp(path.join(os.tmpdir(), "voice-download-"));
	roots.push(root);
	return {
		file: path.join(root, "model"),
		signal: new AbortController(),
		hash: createHash("sha256").update("data").digest("hex"),
	};
}
it("streams verified bytes with omitted credentials and bounded HTTPS redirects", async () => {
	const f = await fixture(),
		progress = vi.fn();
	const fetcher = vi
		.fn<typeof fetch>()
		.mockResolvedValueOnce(
			new Response(null, { status: 302, headers: { location: "https://cdn.hf.co/file" } }),
		)
		.mockResolvedValueOnce(new Response("data", { headers: { "content-length": "4" } }));
	await downloadModelFile(
		"https://huggingface.co/model",
		f.file,
		4,
		f.hash,
		f.signal.signal,
		progress,
		fetcher,
	);
	expect(await fs.readFile(f.file, "utf8")).toBe("data");
	expect(progress).toHaveBeenCalledWith(4);
	expect(fetcher.mock.calls[1][1]).toMatchObject({ credentials: "omit", redirect: "manual" });
});
it.each([
	"http://huggingface.co/a",
	"https://127.0.0.1/a",
	"https://evil.example/a",
	"https://a:h@huggingface.co/a",
])("rejects redirected origin %s before contacting it", async (target) => {
	const f = await fixture(),
		fetcher = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(null, { status: 302, headers: { location: target } }));
	await expect(
		downloadModelFile(
			"https://huggingface.co/model",
			f.file,
			4,
			f.hash,
			f.signal.signal,
			vi.fn(),
			fetcher,
		),
	).rejects.toThrow("download-origin");
	expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(["bad!", "too-long", "x"])("rejects mismatched streamed data %s", async (body) => {
	const f = await fixture(),
		fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body));
	await expect(
		downloadModelFile(
			"https://huggingface.co/model",
			f.file,
			4,
			f.hash,
			f.signal.signal,
			vi.fn(),
			fetcher,
		),
	).rejects.toThrow(/download-(size|integrity)/);
});
it("aborts before requesting data and never overwrites an existing file", async () => {
	const f = await fixture(),
		fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("data"));
	f.signal.abort();
	await expect(
		downloadModelFile(
			"https://huggingface.co/model",
			f.file,
			4,
			f.hash,
			f.signal.signal,
			vi.fn(),
			fetcher,
		),
	).rejects.toThrow();
	expect(fetcher).not.toHaveBeenCalled();
	await fs.writeFile(f.file, "original");
	await expect(
		downloadModelFile(
			"https://huggingface.co/model",
			f.file,
			4,
			f.hash,
			new AbortController().signal,
			vi.fn(),
			fetcher,
		),
	).rejects.toThrow();
	expect(await fs.readFile(f.file, "utf8")).toBe("original");
});
it("keeps runtime publishers separate from model download origins", async () => {
	const f = await fixture(),
		fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("data"));
	await expect(
		downloadModelFile(
			"https://files.pythonhosted.org/package.whl",
			f.file,
			4,
			f.hash,
			f.signal.signal,
			vi.fn(),
			fetcher,
		),
	).rejects.toThrow("download-origin");
	expect(fetcher).not.toHaveBeenCalled();
	await downloadModelFile(
		"https://files.pythonhosted.org/package.whl",
		f.file,
		4,
		f.hash,
		f.signal.signal,
		vi.fn(),
		fetcher,
		"runtime",
	);
	expect(await fs.readFile(f.file, "utf8")).toBe("data");
	await expect(
		downloadModelFile(
			"https://huggingface.co/package",
			f.file,
			4,
			f.hash,
			f.signal.signal,
			vi.fn(),
			fetcher,
			"runtime",
		),
	).rejects.toThrow("download-origin");
});
