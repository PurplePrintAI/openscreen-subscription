// Pin the speech runtime independently of upstream's moving "latest run" lookup.
// No credentials are read here: gh uses its normal authenticated public-artifact access.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(
	fs.readFileSync(path.join(root, "build/fork-speech-payload.json"), "utf8"),
);
const destination = path.join(root, "electron/native/bin/win32-x64");
const hash = (filename) =>
	createHash("sha256").update(fs.readFileSync(filename)).digest("hex").toUpperCase();
const complete = manifest.files.every((entry) => {
	const filename = path.join(destination, entry.name);
	return fs.existsSync(filename) && hash(filename) === entry.sha256;
});

if (complete) {
	console.log("Pinned speech runtime is already staged and SHA-256 verified.");
} else {
	const tempParent = os.tmpdir();
	const temporary = fs.mkdtempSync(path.join(tempParent, "openscreen-speech-"));
	if (
		path.dirname(temporary) !== tempParent ||
		!path.basename(temporary).startsWith("openscreen-speech-")
	) {
		throw new Error("Unexpected staging directory.");
	}
	try {
		execFileSync(
			"gh",
			[
				"run",
				"download",
				String(manifest.runId),
				"--repo",
				manifest.repository,
				"--name",
				manifest.artifact,
				"--dir",
				temporary,
			],
			{ stdio: "inherit", windowsHide: true },
		);
		const archive = path.join(temporary, `${manifest.artifact}.tar.gz`);
		if (hash(archive) !== manifest.archiveSha256)
			throw new Error("Speech archive checksum mismatch.");
		const members = execFileSync("tar", ["-tzf", archive], { encoding: "utf8", windowsHide: true })
			.trim()
			.split(/\r?\n/);
		if (members.some((name) => !/^whisper-stt-win32-x64\/([A-Za-z0-9_.-]+)?$/.test(name))) {
			throw new Error("Unexpected speech archive member path.");
		}
		execFileSync("tar", ["-xzf", archive, "-C", temporary], { windowsHide: true });
		for (const entry of manifest.files) {
			if (!/^[A-Za-z0-9_.-]+$/.test(entry.name))
				throw new Error("Invalid speech manifest filename.");
			const source = path.join(temporary, manifest.artifact, entry.name);
			if (hash(source) !== entry.sha256)
				throw new Error(`Speech binary checksum mismatch: ${entry.name}`);
		}
		fs.mkdirSync(destination, { recursive: true });
		for (const entry of manifest.files)
			fs.copyFileSync(
				path.join(temporary, manifest.artifact, entry.name),
				path.join(destination, entry.name),
			);
		console.log("Pinned speech runtime staged and SHA-256 verified.");
	} finally {
		fs.rmSync(temporary, { recursive: true, force: true });
	}
}
