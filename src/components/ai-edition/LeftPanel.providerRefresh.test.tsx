// @vitest-environment jsdom
// Issue #420: the provider dialog's open state moved out of `ChatStripPanel` and into
// EditorDialogsContext, and the `onClose` that used to re-read the LLM snapshot went with it.
// Connecting a provider in that dialog is what enables the composer here and what fills the
// model pill, so the panel now refreshes whenever the dialog is NOT open — on mount, and again
// on every close.
//
// That re-read is the one behaviour the lift had to re-establish by hand rather than move, and
// it cannot be seen from the dialog's own tests (they never mount this panel), so it is pinned
// here: refreshed once on mount, not again when the dialog opens, once more when it closes.

import "@testing-library/jest-dom";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import type {
	AiEditionChatEvent,
	AiEditionChatResult,
	AiEditionLlmConfig,
	AiEditionLlmProviderModelsResult,
	AiEditionLlmSnapshot,
} from "@/native/contracts";

const llmGetSnapshot = vi.fn<() => Promise<AiEditionLlmSnapshot>>(() =>
	Promise.resolve({
		config: null,
		connectedProviders: [],
		availableProviders: [],
		credentialSummary: [],
	}),
);
const chatListSessions = vi.fn(
	async (_projectId: string) =>
		[] as Array<{
			id: string;
			projectId: string;
			title: string;
			messageCount: number;
			createdAt: string;
		}>,
);
const chatSelectSession = vi.fn();
const chatCreateSession = vi.fn();
const chatRewind = vi.fn();
const chatRun = vi.fn<() => Promise<AiEditionChatResult>>();
const modelList = vi.fn<() => Promise<AiEditionLlmProviderModelsResult>>();
const saveModel = vi.fn(async (_config: AiEditionLlmConfig) => ({ success: true }));
let chatEvent: ((event: AiEditionChatEvent) => void) | undefined;

vi.mock("@/native/client", () => ({
	nativeBridgeClient: {
		aiEdition: {
			llmGetSnapshot: () => llmGetSnapshot(),
			chatListSessions: (id: string) => chatListSessions(id),
			chatSelectSession: (...args: unknown[]) => chatSelectSession(...args),
			chatCreateSession: (...args: unknown[]) => chatCreateSession(...args),
			chatRun: () => chatRun(),
			chatRewind: (...args: unknown[]) => chatRewind(...args),
			chatBudget: () => Promise.resolve(null),
			llmListProviderModels: () => modelList(),
			llmSetConfig: (config: AiEditionLlmConfig) => saveModel(config),
		},
	},
}));

// The panel's copy is not what is under test, and an echoing translator keeps this file off
// the critical path of a copy edit.
vi.mock("@/contexts/I18nContext", () => ({
	useI18n: () => ({
		locale: "en",
		setLocale: () => {
			/* fixed locale */
		},
	}),
	useScopedT: () => (key: string) => key,
}));

import { EditorDialogsProvider, useEditorDialogActions } from "@/contexts/EditorDialogsContext";
import { LeftPanel } from "./LeftPanel";

let dialogActions: ReturnType<typeof useEditorDialogActions> | null = null;

/** Hands the test the context's openers, which the app menu and the panel's own gear share. */
function CaptureDialogActions() {
	dialogActions = useEditorDialogActions();
	return null;
}

beforeEach(() => {
	llmGetSnapshot.mockClear();
	chatListSessions.mockReset().mockResolvedValue([]);
	chatSelectSession.mockReset().mockResolvedValue(null);
	chatCreateSession.mockReset();
	chatRewind.mockReset().mockResolvedValue({ success: false, error: "test refused" });
	chatRun.mockReset();
	modelList.mockReset().mockResolvedValue({ models: [] });
	saveModel.mockClear();
	useProjectStore.setState({ projectId: null, document: null });
	dialogActions = null;
	// The panel subscribes to streamed chat events on mount; there is no preload in jsdom.
	(window as unknown as { electronAPI?: unknown }).electronAPI = {
		onAiEditionChatEvent: (callback: (event: AiEditionChatEvent) => void) => {
			chatEvent = callback;
			return () => {
				chatEvent = undefined;
			};
		},
	};
	// jsdom implements no scrolling at all, and the transcript pins itself to the bottom on
	// every render.
	Element.prototype.scrollTo = () => {
		/* no scrolling in jsdom */
	};
});

afterEach(() => {
	cleanup();
	useProjectStore.setState({ projectId: null, document: null });
	(window as unknown as { electronAPI?: unknown }).electronAPI = undefined;
});

describe("ChatStripPanel streaming", () => {
	const session = {
		id: "session-stream",
		projectId: "project-stream",
		title: "Conversation",
		messageCount: 0,
		createdAt: "2026-08-27T12:00:00Z",
	};
	async function ready(empty = false) {
		llmGetSnapshot.mockResolvedValue({
			config: { provider: "openai", model: "test" },
			connectedProviders: ["openai"],
			availableProviders: [],
			credentialSummary: [],
		});
		useProjectStore.setState({ projectId: session.projectId });
		chatListSessions.mockResolvedValue([session]);
		if (empty) chatListSessions.mockResolvedValueOnce([]);
		chatSelectSession.mockResolvedValue({ ...session, messages: [] });
		chatCreateSession.mockResolvedValue(session);
		render(
			<EditorDialogsProvider>
				<LeftPanel active="chat" />
			</EditorDialogsProvider>,
		);
		await waitFor(() => expect(screen.getByRole("textbox")).toBeEnabled());
		if (!empty) await waitFor(() => expect(chatSelectSession).toHaveBeenCalled());
	}
	function send() {
		fireEvent.change(screen.getByRole("textbox"), { target: { value: "My prompt" } });
		fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
	}
	it("streams Markdown, ignores unrelated events and reconciles one final message with a working rewind ID", async () => {
		let finish!: (result: AiEditionChatResult) => void;
		chatRun.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		await ready(true);
		send();
		await waitFor(() => expect(chatRun).toHaveBeenCalledOnce());
		act(() => {
			chatEvent?.({ kind: "text", sessionId: "other-session", delta: "WRONG" });
			chatEvent?.({ kind: "text", sessionId: session.id, delta: "**Live" });
			chatEvent?.({ kind: "text", sessionId: session.id, delta: " answer**" });
			chatEvent?.({ kind: "thinking", sessionId: session.id, delta: "Trace from this turn" });
		});
		await waitFor(() => expect(screen.getByText("Live answer").tagName).toBe("STRONG"));
		expect(screen.queryByText("WRONG")).toBeNull();
		expect(screen.getAllByText("My prompt")).toHaveLength(1);
		await act(async () =>
			finish({
				success: true,
				userMessageCheckpointId: "canonical-user",
				assistantMessage: {
					id: "final-assistant",
					role: "assistant",
					content: "**Final answer**",
					createdAt: "2026-08-27T12:00:01Z",
				},
			}),
		);
		expect(screen.queryByText("Live answer")).toBeNull();
		expect(screen.getAllByText("Final answer")).toHaveLength(1);
		expect(screen.getByText("Trace from this turn")).toBeInTheDocument();
		expect(screen.getAllByRole("article")).toHaveLength(2);
		fireEvent.click(screen.getByRole("button", { name: "chat.rewindToMessage" }));
		expect(screen.getByRole("button", { name: "chat.rewindToMessage" })).toHaveAttribute(
			"aria-expanded",
			"true",
		);
		fireEvent.click(screen.getByRole("button", { name: "chat.rewindConfirm" }));
		await waitFor(() =>
			expect(chatRewind).toHaveBeenCalledWith(session.projectId, session.id, "canonical-user"),
		);
		act(() => chatEvent?.({ kind: "text", sessionId: session.id, delta: "AFTER FINISH" }));
		expect(screen.queryByText("AFTER FINISH")).toBeNull();
	});

	it("keeps an interrupted partial reply, clearly marked incomplete", async () => {
		let finish!: (result: AiEditionChatResult) => void;
		chatRun.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		await ready();
		send();
		await waitFor(() => expect(chatRun).toHaveBeenCalledOnce());
		act(() => chatEvent?.({ kind: "text", sessionId: session.id, delta: "Partial reply" }));
		await act(async () => finish({ success: false, error: "Connection lost" }));
		expect(screen.getByText("Partial reply")).toBeInTheDocument();
		expect(screen.getByText("chat.responseInterrupted")).toBeInTheDocument();
		expect(screen.queryByText("chat.responding")).toBeNull();
	});

	it("leaves scroll position alone while reading older messages and follows again at the bottom", async () => {
		let finish!: (result: AiEditionChatResult) => void;
		chatRun.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		await ready();
		send();
		await waitFor(() => expect(chatRun).toHaveBeenCalledOnce());
		const transcript = screen.getAllByRole("article")[0].parentElement!;
		Object.defineProperties(transcript, {
			scrollHeight: { configurable: true, value: 1000 },
			clientHeight: { configurable: true, value: 200 },
		});
		const scroll = vi.spyOn(transcript, "scrollTo");
		fireEvent.scroll(transcript);
		act(() => chatEvent?.({ kind: "text", sessionId: session.id, delta: "First chunk" }));
		await screen.findByText("First chunk");
		expect(scroll).not.toHaveBeenCalled();
		transcript.scrollTop = 800;
		fireEvent.scroll(transcript);
		act(() => chatEvent?.({ kind: "text", sessionId: session.id, delta: " continued" }));
		await waitFor(() => expect(scroll).toHaveBeenCalled());
		await act(async () => finish({ success: false, error: "test ended" }));
	});

	it("does not apply or display a late response after changing projects", async () => {
		let finish!: (result: AiEditionChatResult) => void;
		chatRun.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		await ready();
		send();
		await waitFor(() => expect(chatRun).toHaveBeenCalledOnce());
		chatListSessions.mockResolvedValue([]);
		act(() => useProjectStore.setState({ projectId: "different-project" }));
		await act(async () =>
			finish({
				success: true,
				assistantMessage: {
					id: "late",
					role: "assistant",
					content: "LATE RESPONSE",
					createdAt: "2026-08-27T12:00:01Z",
				},
			}),
		);
		expect(screen.queryByText("LATE RESPONSE")).toBeNull();
		expect(screen.queryByText("My prompt")).toBeNull();
	});
});

describe("ChatStripPanel, against the lifted provider dialog", () => {
	it("shows and searches runtime model labels while saving the exact CLI selection value", async () => {
		const config = {
			provider: "claude-local",
			model: "sonnet",
			allowAgentEdits: false,
			contextBudgetTokens: 200_000,
		};
		llmGetSnapshot.mockResolvedValue({
			config,
			connectedProviders: ["claude-local"],
			availableProviders: [],
			credentialSummary: [],
		});
		modelList.mockResolvedValue({
			models: ["sonnet", "claude-opus-4-8[1m]"],
			catalog: [
				{
					id: "sonnet",
					label: "Sonnet 5",
					contextWindowTokens: 1_000_000,
					contextWindowSource: "official",
				},
				{ id: "claude-opus-4-8[1m]", label: "Opus 4.8 (1M context)" },
			],
		});
		render(
			<EditorDialogsProvider>
				<LeftPanel active="chat" />
			</EditorDialogsProvider>,
		);
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "chat.modelLabel" })).toHaveTextContent("Sonnet 5"),
		);
		expect(screen.getByRole("button", { name: "chat.contextSettings" })).toHaveTextContent(
			"chat.contextPercentWithLimit",
		);
		fireEvent.click(screen.getByRole("button", { name: "chat.modelLabel" }));
		const option = await screen.findByRole("button", { name: "Opus 4.8 (1M context)" });
		fireEvent.change(screen.getByPlaceholderText("chat.searchModels"), {
			target: { value: "Opus 4.8" },
		});
		expect(screen.queryByRole("button", { name: "Sonnet 5" })).toBeNull();
		fireEvent.click(option);
		await waitFor(() =>
			expect(saveModel).toHaveBeenCalledWith({ ...config, model: "claude-opus-4-8[1m]" }),
		);
	});
	it("loads Codex model metadata and shows its verified context window", async () => {
		llmGetSnapshot.mockResolvedValue({
			config: {
				provider: "codex-subscription",
				model: "gpt-5.6-sol",
				contextBudgetTokens: 80_000,
			},
			connectedProviders: ["codex-subscription"],
			availableProviders: [],
			credentialSummary: [],
		});
		modelList.mockResolvedValue({
			models: ["gpt-5.6-sol"],
			catalog: [
				{
					id: "gpt-5.6-sol",
					label: "GPT-5.6-Sol",
					contextWindowTokens: 1_050_000,
					contextWindowSource: "official",
				},
			],
		});
		render(
			<EditorDialogsProvider>
				<LeftPanel active="chat" />
			</EditorDialogsProvider>,
		);
		await waitFor(() => expect(modelList).toHaveBeenCalledOnce());
		expect(screen.getByRole("button", { name: "chat.contextSettings" })).toHaveTextContent(
			"chat.contextPercentWithLimit",
		);
		fireEvent.click(screen.getByRole("button", { name: "chat.contextSettings" }));
		expect(screen.getByText("ChatGPT subscription (Codex) · GPT-5.6-Sol")).toBeVisible();
	});
	it("re-reads the LLM snapshot when the dialog closes, and not when it opens", async () => {
		render(
			<EditorDialogsProvider>
				<CaptureDialogActions />
				<LeftPanel active="chat" />
			</EditorDialogsProvider>,
		);
		// Mount: the dialog is closed, so the same effect that watches for a close seeds the
		// composer's view of the provider config.
		await act(async () => {
			await Promise.resolve();
		});
		expect(llmGetSnapshot).toHaveBeenCalledTimes(1);

		// Opening it must not refresh — nothing has been connected yet, and the old code's
		// `onClose` did not fire here either.
		await act(async () => {
			dialogActions?.openDialog("providers");
		});
		expect(llmGetSnapshot).toHaveBeenCalledTimes(1);

		// Closing is the event that used to be `onClose` -> `refreshLlm()`.
		await act(async () => {
			dialogActions?.closeDialog();
		});
		expect(llmGetSnapshot).toHaveBeenCalledTimes(2);
	});
});
