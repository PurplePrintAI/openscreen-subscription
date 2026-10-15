import { createHash } from "node:crypto";
import fs from "node:fs/promises";

function allowed(url: URL, kind: "model" | "runtime") {
	return (
		url.protocol === "https:" &&
		!url.username &&
		!url.password &&
		(!url.port || url.port === "443") &&
		(kind === "runtime"
			? [
					"github.com",
					"release-assets.githubusercontent.com",
					"objects.githubusercontent.com",
					"files.pythonhosted.org",
					"download.pytorch.org",
					"download-r2.pytorch.org",
				].includes(url.hostname)
			: url.hostname === "huggingface.co" ||
				url.hostname.endsWith(".huggingface.co") ||
				url.hostname.endsWith(".hf.co"))
	);
}
/** Fixed-manifest data only. No credentials, remote scripts, shell or automatic retries. */
export async function downloadModelFile(
	url: string,
	output: string,
	bytes: number,
	sha256: string,
	signal: AbortSignal,
	progress: (bytes: number) => void,
	fetcher: typeof fetch = fetch,
	kind: "model" | "runtime" = "model",
) {
	const controller = new AbortController();
	const abort = () => controller.abort();
	signal.addEventListener("abort", abort, { once: true });
	const totalTimer = setTimeout(abort, 90 * 60_000);
	let idle = setTimeout(abort, 30_000);
	let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	let file: Awaited<ReturnType<typeof fs.open>> | undefined;
	try {
		signal.throwIfAborted();
		let target = new URL(url);
		let response: Response | undefined;
		for (let i = 0; i < 8; i++) {
			if (!allowed(target, kind)) throw new Error("download-origin");
			response = await fetcher(target, {
				redirect: "manual",
				credentials: "omit",
				headers: { "Accept-Encoding": "identity" },
				signal: controller.signal,
			});
			if (![301, 302, 303, 307, 308].includes(response.status)) break;
			await response.body?.cancel();
			const location = response.headers.get("location");
			if (!location) throw new Error("download-redirect");
			target = new URL(location, target);
		}
		if (!response?.ok || !response.body) throw new Error("download-http");
		const length = response.headers.get("content-length");
		if (length && Number(length) !== bytes) throw new Error("download-size");
		file = await fs.open(output, "wx");
		reader = response.body.getReader();
		const hash = createHash("sha256");
		let received = 0;
		for (;;) {
			signal.throwIfAborted();
			const chunk = await reader.read();
			if (chunk.done) break;
			clearTimeout(idle);
			idle = setTimeout(abort, 30_000);
			received += chunk.value.byteLength;
			if (received > bytes) throw new Error("download-size");
			hash.update(chunk.value);
			await file.writeFile(chunk.value);
			progress(received);
		}
		if (received !== bytes || hash.digest("hex") !== sha256) throw new Error("download-integrity");
		await file.sync();
	} finally {
		// Also stop a response rejected before its reader was acquired (size/status/open failure).
		controller.abort();
		clearTimeout(idle);
		clearTimeout(totalTimer);
		signal.removeEventListener("abort", abort);
		await reader?.cancel().catch(() => undefined);
		await file?.close();
	}
}
