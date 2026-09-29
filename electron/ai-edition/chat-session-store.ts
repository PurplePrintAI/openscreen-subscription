// Project-scoped transcript storage. Chat text and document checkpoints stay
// under the app's userData directory; provider credentials are never written here.

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { documentSchema, migrateRawDocumentToCurrent } from "../../src/lib/ai-edition/schema";
import type { ChatSession, MessageCheckpoint } from "./chat-service";

const messageSchema = z.object({
	id: z.string().min(1),
	role: z.enum(["user", "assistant"]),
	content: z.string(),
	createdAt: z.string(),
	toolCalls: z.array(z.object({ name: z.string(), summary: z.string() })).optional(),
	checkpointId: z.string().nullable().optional(),
	generatedImagePath: z.string().optional(),
});

const sessionSchema = z.object({
	id: z.string().min(1),
	projectId: z.string(),
	title: z.string(),
	createdAt: z.string(),
	messages: z.array(messageSchema),
	compaction: z
		.object({ summary: messageSchema, coveredCount: z.number().int().nonnegative() })
		.optional(),
	checkpoints: z.array(
		z.object({
			userMessageId: z.string(),
			createdAt: z.string(),
			document: z.unknown(),
		}),
	),
});

const projectSchema = z.object({
	version: z.literal(1),
	projectId: z.string(),
	sessions: z.array(sessionSchema),
});

export interface StoredChatSession {
	session: ChatSession;
	checkpoints: MessageCheckpoint[];
}

function safeProjectId(projectId: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(projectId)) {
		throw new Error("Invalid chat project id.");
	}
	return projectId;
}

function renameWithRetry(from: string, to: string): void {
	const retryable = new Set(["EPERM", "EACCES", "EBUSY"]);
	const sleeper = new Int32Array(new SharedArrayBuffer(4));
	for (let attempt = 0; ; attempt += 1) {
		try {
			fs.renameSync(from, to);
			return;
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code ?? "";
			if (attempt >= 5 || !retryable.has(code)) throw error;
			Atomics.wait(sleeper, 0, 0, 10 * 2 ** attempt);
		}
	}
}

export class ChatSessionStore {
	private readonly root: string;

	constructor(userDataPath: string) {
		this.root = path.join(userDataPath, "chat-sessions");
	}

	private fileFor(projectId: string): string {
		return path.join(this.root, safeProjectId(projectId) + ".json");
	}

	loadProject(projectId: string): StoredChatSession[] {
		let raw: string;
		try {
			raw = fs.readFileSync(this.fileFor(projectId), "utf8");
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
			throw error;
		}
		try {
			const parsed = projectSchema.parse(JSON.parse(raw));
			if (parsed.projectId !== projectId) throw new Error("Project id mismatch.");
			const seen = new Set<string>();
			return parsed.sessions.map((entry) => {
				if (entry.projectId !== projectId || seen.has(entry.id)) {
					throw new Error("Invalid or duplicate chat session.");
				}
				seen.add(entry.id);
				const checkpoints: MessageCheckpoint[] = [];
				for (const checkpoint of entry.checkpoints) {
					try {
						const document = documentSchema.parse(migrateRawDocumentToCurrent(checkpoint.document));
						if (document.project.id !== projectId) {
							throw new Error("Checkpoint belongs to another project.");
						}
						checkpoints.push({
							userMessageId: checkpoint.userMessageId,
							createdAt: checkpoint.createdAt,
							document,
						});
					} catch (error) {
						console.warn("[ai-edition] skipped an unreadable chat checkpoint:", error);
					}
				}
				const checkpointIds = new Set(checkpoints.map((checkpoint) => checkpoint.userMessageId));
				const messages = entry.messages.map((message) =>
					message.checkpointId && !checkpointIds.has(message.checkpointId)
						? { ...message, checkpointId: null }
						: message,
				);
				const compaction =
					entry.compaction && entry.compaction.coveredCount <= messages.length
						? entry.compaction
						: undefined;
				return {
					session: {
						id: entry.id,
						projectId,
						title: entry.title,
						createdAt: entry.createdAt,
						messages,
						compaction,
					},
					checkpoints,
				};
			});
		} catch (error) {
			// Never overwrite a file we cannot parse: the owner's conversation
			// may still be recoverable from the untouched bytes.
			throw new Error(
				"Cannot load saved conversations for " +
					projectId +
					": " +
					(error instanceof Error ? error.message : String(error)),
			);
		}
	}

	saveProject(projectId: string, sessions: StoredChatSession[]): void {
		const file = this.fileFor(projectId);
		fs.mkdirSync(this.root, { recursive: true });
		const temp = file + ".tmp-" + process.pid + "-" + randomUUID();
		const payload = JSON.stringify({
			version: 1,
			projectId,
			sessions: sessions.map(({ session, checkpoints }) => ({ ...session, checkpoints })),
		});
		let fd: number | undefined;
		try {
			fd = fs.openSync(temp, "w");
			fs.writeFileSync(fd, payload, "utf8");
			fs.fsyncSync(fd);
			fs.closeSync(fd);
			fd = undefined;
			renameWithRetry(temp, file);
		} catch (error) {
			if (fd !== undefined) fs.closeSync(fd);
			try {
				fs.unlinkSync(temp);
			} catch {
				// Nothing to remove if the write failed before opening the temp file.
			}
			throw error;
		}
	}

	deleteProject(projectId: string): void {
		try {
			fs.unlinkSync(this.fileFor(projectId));
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		}
	}
}
