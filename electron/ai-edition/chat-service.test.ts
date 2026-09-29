import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type AxcutDocument, createEmptyDocument } from "../../src/lib/ai-edition/schema";
import {
	appendGeneratedScene,
	configureChatSessionStorage,
	createSession,
	deleteProjectSessions,
	deleteSession,
	listSessions,
	renameSession,
	runTimelineOperation,
	selectSession,
} from "./chat-service";
import { DocumentService } from "./document-service";
import type { LlmConfigStore } from "./llm-config-store";

describe("chat-service sessions", () => {
	const projectId = "proj_test";
	beforeEach(() => {
		// ponytail: in-memory store, no teardown needed between tests — just
		// use a fresh projectId per test where isolation matters.
	});

	it("createSession returns a summary with messageCount=0", () => {
		const s = createSession(projectId, "  My chat  ");
		expect(s.title).toBe("My chat");
		expect(s.messageCount).toBe(0);
		expect(s.projectId).toBe(projectId);
		expect(s.id).toMatch(/^sess_/);
	});

	it("listSessions returns an empty array for a fresh project", () => {
		const list = listSessions("proj_empty");
		expect(list).toEqual([]);
	});

	it("selectSession returns the session with a copy of the messages array", () => {
		const s = createSession(projectId);
		const got = selectSession(projectId, s.id);
		expect(got).not.toBeNull();
		expect(got?.id).toBe(s.id);
		expect(got?.messages).toEqual([]);
		// ponytail: messages array is a copy, mutations don't leak.
		if (got) got.messages.push({} as never);
		const got2 = selectSession(projectId, s.id);
		expect(got2?.messages).toEqual([]);
	});

	it("records a generated image in its own session", () => {
		const project = "proj_generated_scene";
		const session = createSession(project);
		const messages = appendGeneratedScene(
			project,
			session.id,
			"A violet sphere",
			"/tmp/source.png",
		);
		expect(selectSession(project, session.id)?.messages).toEqual([
			messages.userMessage,
			messages.assistantMessage,
		]);
		expect(messages.assistantMessage.generatedImagePath).toBe("/tmp/source.png");
		expect(listSessions(project)[0].messageCount).toBe(2);
		expect(() => appendGeneratedScene(project, "other-session", "x", "/tmp/x.png")).toThrow(
			"unavailable",
		);
	});

	it("selectSession returns null for an unknown sessionId", () => {
		expect(selectSession(projectId, "nope")).toBeNull();
	});

	it("renameSession updates the title and returns the updated summary", () => {
		const s = createSession(projectId);
		const updated = renameSession(projectId, s.id, "  Renamed  ");
		expect(updated?.title).toBe("Renamed");
		const got = selectSession(projectId, s.id);
		expect(got?.title).toBe("Renamed");
	});

	it("renameSession ignores empty input and keeps the existing title", () => {
		const s = createSession(projectId, "Original");
		const updated = renameSession(projectId, s.id, "   ");
		expect(updated?.title).toBe("Original");
	});

	it("renameSession returns null for an unknown sessionId", () => {
		expect(renameSession(projectId, "nope", "x")).toBeNull();
	});

	it("deleteSession removes the session and returns true", () => {
		const s = createSession(projectId);
		expect(deleteSession(projectId, s.id)).toBe(true);
		expect(selectSession(projectId, s.id)).toBeNull();
		expect(listSessions(projectId).find((x) => x.id === s.id)).toBeUndefined();
	});

	it("deleteSession returns false for an unknown id", () => {
		expect(deleteSession(projectId, "nope")).toBe(false);
	});

	it("listSessions returns sessions sorted by createdAt", async () => {
		const a = createSession("proj_sort", "A");
		await new Promise((r) => setTimeout(r, 5));
		const b = createSession("proj_sort", "B");
		await new Promise((r) => setTimeout(r, 5));
		const c = createSession("proj_sort", "C");
		const list = listSessions("proj_sort");
		expect(list.map((x) => x.id)).toEqual([a.id, b.id, c.id]);
	});

	it("listSessions only includes the requested project", () => {
		createSession("proj_a");
		createSession("proj_b");
		createSession("proj_b");
		expect(listSessions("proj_a").length).toBe(1);
		expect(listSessions("proj_b").length).toBe(2);
	});
});

// ponytail: type-only check that the runChat signature now takes a sessionId.
// We don't exercise the LLM call here — the real provider path needs network
// + API keys, which the integration tests cover elsewhere.
describe("chat-service runChat signature", () => {
	it("accepts (projectId, sessionId, message, llmConfig) and short-circuits without a config", async () => {
		// ponytail: stub LlmConfigStore whose getConfig() returns null, so
		// runChat exits early with the "No LLM provider configured" error.
		const llmConfig = { getConfig: () => null } as unknown as LlmConfigStore;
		const { runChat, createSession } = await import("./chat-service");
		const s = createSession("proj_sig");
		const result = await runChat("proj_sig", s.id, "hi", llmConfig);
		expect(result.success).toBe(false);
		expect(result.error).toMatch(/No LLM provider/);
	});
});

// ponytail: runTimelineOperation reads, applies, saves, and records a chat
// summary. Tested with a stub DocumentService so the test is fast + offline.
describe("runTimelineOperation", () => {
	function makeDocument(): AxcutDocument {
		const base = createEmptyDocument({ title: "T", projectId: "proj_run" });
		const assetId = "asset_1";
		return {
			...base,
			project: { ...base.project, primaryAssetId: assetId },
			assets: [
				{
					id: assetId,
					kind: "video" as const,
					label: "Rec",
					originalPath: "/tmp/r.mp4",
					durationSec: 60,
					// Screen-only recording: no webcam track attached.
					cameraTrack: null,
				},
			],
			timeline: {
				...base.timeline,
				clips: [
					{
						id: "c1",
						assetId,
						sourceStartSec: 0,
						sourceEndSec: 60,
						timelineStartSec: 0,
						timelineEndSec: 60,
						wordRefs: [],
						origin: "user" as const,
						reason: "",
					},
				],
			},
		};
	}

	// runTimelineOperation takes the concrete DocumentService, which owns private
	// state (projectsRoot, the per-project write queue), so no object literal can
	// stand in for it. Subclassing keeps the stub a real DocumentService while
	// replacing the only two methods runTimelineOperation calls with in-memory
	// versions — nothing here touches the filesystem, so neither projectsRoot nor
	// the media-links directory is ever read and no directory is created.
	class StubDocumentService extends DocumentService {
		constructor(readonly file: { stored: AxcutDocument | undefined }) {
			const unused = path.join(tmpdir(), "openscreen-chat-service-test-unused");
			super(unused, unused);
		}

		override async getProject(): Promise<AxcutDocument> {
			if (!this.file.stored) throw new Error("no document");
			return this.file.stored;
		}

		override async saveProject(doc: AxcutDocument): Promise<AxcutDocument> {
			this.file.stored = doc;
			return doc;
		}
	}

	// Same stub, but both disk-facing methods fail — the "disk is dead" path.
	class BrokenDocumentService extends StubDocumentService {
		override async getProject(): Promise<AxcutDocument> {
			throw new Error("disk is dead");
		}

		override async saveProject(): Promise<AxcutDocument> {
			throw new Error("disk is dead");
		}
	}

	function makeDocumentsStub() {
		const file: { stored: AxcutDocument | undefined } = { stored: makeDocument() };
		return { documents: new StubDocumentService(file), file };
	}

	it("applies the op, persists, and records an assistant summary", async () => {
		const { documents, file } = makeDocumentsStub();
		const s = createSession("proj_run");
		const result = await runTimelineOperation(
			"proj_run",
			s.id,
			{ type: "add_trim_range", startSec: 5, endSec: 8 },
			"Trimmed silence",
			documents,
		);
		expect(result.success).toBe(true);
		if (!result.success) return;
		expect(result.result.summary).toMatch(/added trim/);
		const saved = file.stored?.timeline.trimRanges ?? [];
		expect(saved.some((s) => s.startSec === 5)).toBe(true);
		const session = selectSession("proj_run", s.id);
		expect(session?.messages).toHaveLength(1);
		expect(session?.messages[0].content).toBe("Trimmed silence");
		expect(session?.messages[0].role).toBe("assistant");
	});

	it("records the summary when a timeline operation creates its first chat", async () => {
		const { documents } = makeDocumentsStub();
		const result = await runTimelineOperation(
			"proj_run_new",
			"missing-session",
			{ type: "add_trim_range", startSec: 5, endSec: 8 },
			"Trimmed silence",
			documents,
		);
		expect(result.success).toBe(true);
		expect(listSessions("proj_run_new")).toEqual([expect.objectContaining({ messageCount: 1 })]);
	});

	it("returns success:false on getProject failure", async () => {
		const documents = new BrokenDocumentService({ stored: makeDocument() });
		const s = createSession("proj_run_err");
		const result = await runTimelineOperation(
			"proj_run_err",
			s.id,
			{ type: "restore_full_timeline" },
			"",
			documents,
		);
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error).toBe("disk is dead");
	});
});

describe("chat session persistence", () => {
	let userDataPath: string;

	beforeEach(async () => {
		userDataPath = await mkdtemp(path.join(tmpdir(), "openscreen-chat-sessions-"));
		configureChatSessionStorage(userDataPath);
	});

	afterEach(async () => {
		configureChatSessionStorage(null);
		await rm(userDataPath, { recursive: true, force: true });
	});

	it("restores renamed conversations and generated-image messages after a restart", () => {
		const projectId = "proj_saved_chat";
		const session = createSession(projectId);
		renameSession(projectId, session.id, "Storyboard");
		const generated = appendGeneratedScene(
			projectId,
			session.id,
			"A violet sphere",
			"C:/studio/source.png",
		);
		const other = createSession("proj_other_chat");

		configureChatSessionStorage(userDataPath);

		expect(listSessions(projectId)).toEqual([
			expect.objectContaining({ id: session.id, title: "Storyboard", messageCount: 2 }),
		]);
		expect(selectSession(projectId, session.id)?.messages).toEqual([
			generated.userMessage,
			generated.assistantMessage,
		]);
		expect(selectSession(projectId, session.id)?.messages[1]?.generatedImagePath).toBe(
			"C:/studio/source.png",
		);
		expect(listSessions("proj_other_chat")[0]?.id).toBe(other.id);
	});

	it("keeps deletion durable and removes all chats when their project is deleted", async () => {
		const projectId = "proj_delete_chat";
		const first = createSession(projectId);
		const second = createSession(projectId);
		expect(deleteSession(projectId, first.id)).toBe(true);

		configureChatSessionStorage(userDataPath);
		expect(listSessions(projectId).map((session) => session.id)).toEqual([second.id]);

		deleteProjectSessions(projectId);
		configureChatSessionStorage(userDataPath);
		expect(listSessions(projectId)).toEqual([]);
		await expect(
			readFile(path.join(userDataPath, "chat-sessions", projectId + ".json"), "utf8"),
		).rejects.toMatchObject({ code: "ENOENT" });
	});

	it("does not replace a corrupt history file with an empty conversation", async () => {
		const projectId = "proj_corrupt_chat";
		const file = path.join(userDataPath, "chat-sessions", projectId + ".json");
		await mkdir(path.dirname(file), { recursive: true });
		await writeFile(file, "{unfinished", "utf8");

		expect(() => listSessions(projectId)).toThrow("Cannot load saved conversations");
		expect(() => createSession(projectId)).toThrow("Cannot load saved conversations");
		expect(await readFile(file, "utf8")).toBe("{unfinished");
	});

	it("rejects a project id that could escape the chat directory", () => {
		expect(() => createSession("../outside")).toThrow("Invalid chat project id");
	});
});
