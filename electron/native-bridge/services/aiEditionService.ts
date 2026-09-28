import { resolveContextBudget } from "../../../src/lib/ai-edition/contextBudget";
import { resolveCodexContextWindow } from "../../../src/lib/ai-edition/modelContextWindow";
import { documentSchema } from "../../../src/lib/ai-edition/schema";
import type {
	AiEditionAssetResult,
	AiEditionCaptionTranslateResult,
	AiEditionChatBudget,
	AiEditionChatCompactResult,
	AiEditionChatMessage,
	AiEditionChatResult,
	AiEditionChatRewindResult,
	AiEditionChatSession,
	AiEditionChatSessionSummary,
	AiEditionDocumentResult,
	AiEditionGeneratedSceneResult,
	AiEditionLlmConfig,
	AiEditionLlmDisconnectResult,
	AiEditionLlmModelOption,
	AiEditionLlmProviderModelsResult,
	AiEditionLlmSnapshot,
	AiEditionProjectSummary,
	AiEditionSubscriptionStatus,
} from "../../../src/native/contracts";
import {
	type CaptionTranslateSegment,
	translateCaptionSegments,
} from "../../ai-edition/caption-translate";
import type { ChatEventSink } from "../../ai-edition/chat-service";
import { appendGeneratedScene } from "../../ai-edition/chat-service";
import { getClaudeCli } from "../../ai-edition/claude/cli";
import { getCodexAppServer } from "../../ai-edition/codex/app-server";
import type { DocumentService } from "../../ai-edition/document-service";
import { encodeStillScene, saveGeneratedImage } from "../../ai-edition/generated-scene";
import type { LlmConfigStore, LlmCredential } from "../../ai-edition/llm-config-store";
import {
	listAnthropicModels,
	listGoogleModels,
	listMistralModels,
	listOpenAiCompatibleModels,
	listOpenRouterModels,
	probeMiniMaxModels,
} from "../../ai-edition/llm-provider-auth";
import {
	GPT6_MODELS,
	gpt6ModelOrder,
	PROVIDER_DEFINITIONS,
} from "../../ai-edition/provider-registry";

export interface AiEditionServiceOptions {
	documents: DocumentService;
	/**
	 * A factory, not an instance: building `LlmConfigStore` does two sync
	 * readFileSync plus a `safeStorage` decrypt, and on macOS that decrypt is
	 * backed by a Keychain item — so resolving it while wiring the bridge made
	 * every app launch prompt for Keychain access, including for users who never
	 * open the AI layer. The caller memoises, so this still yields one instance.
	 * Nothing here may call it at construction time; every use sits behind a
	 * method the renderer has to invoke first.
	 */
	llmConfig: () => LlmConfigStore;
	runChat: (
		projectId: string,
		sessionId: string,
		message: string,
		document?: unknown,
		sink?: ChatEventSink,
	) => Promise<AiEditionChatResult>;
	rewindToMessage: (
		projectId: string,
		sessionId: string,
		messageId: string,
	) =>
		| {
				success: true;
				prompt: string;
				document: unknown;
				messages: AiEditionChatMessage[];
		  }
		| { success: false; error: string };
	compactNow: (projectId: string, sessionId: string) => Promise<AiEditionChatCompactResult | null>;
	getContextUsage: (
		projectId: string,
		sessionId: string,
	) => { usedTokens: number; budgetTokens: number; ratio: number; fillPercent: number } | null;
	// ponytail: legacy per-batch undo retired in favor of per-message rewind.
	// Kept on the surface for IPC compatibility; always returns success=false.
	undoLastToolBatch: (projectId: string, sessionId: string) => AiEditionChatResult;
	listSessions: (projectId: string) => AiEditionChatSessionSummary[];
	createSession: (projectId: string, title?: string) => AiEditionChatSessionSummary;
	selectSession: (projectId: string, sessionId: string) => AiEditionChatSession | null;
	renameSession: (
		projectId: string,
		sessionId: string,
		title: string,
	) => AiEditionChatSessionSummary | null;
	deleteSession: (projectId: string, sessionId: string) => boolean;
}

export class AiEditionService {
	constructor(private readonly options: AiEditionServiceOptions) {}

	private llmConfigInstance: LlmConfigStore | null = null;

	/**
	 * Resolves the store on first use, then holds it — `llmGetSnapshot` alone
	 * reads it once per provider definition. See `AiEditionServiceOptions.llmConfig`.
	 */
	private get llmConfig(): LlmConfigStore {
		if (!this.llmConfigInstance) {
			this.llmConfigInstance = this.options.llmConfig();
		}
		return this.llmConfigInstance;
	}

	async listProjects(): Promise<AiEditionProjectSummary[]> {
		return this.options.documents.listProjects();
	}

	async get(projectId: string): Promise<AiEditionDocumentResult> {
		try {
			const document = await this.options.documents.getProject(projectId);
			return { success: true, document };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async create(title?: string): Promise<AiEditionDocumentResult> {
		try {
			const document = await this.options.documents.createProject(title ?? "");
			return { success: true, document };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async save(document: unknown): Promise<AiEditionDocumentResult> {
		try {
			const parsed = documentSchema.parse(document);
			const saved = await this.options.documents.saveProject(parsed);
			return { success: true, document: saved };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async deleteProject(projectId: string): Promise<AiEditionDocumentResult> {
		try {
			await this.options.documents.deleteProject(projectId);
			return { success: true };
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async addAsset(
		projectId: string,
		path: string,
		label?: string,
		durationSec?: number,
	): Promise<AiEditionAssetResult> {
		const document = await this.options.documents.addAsset(projectId, {
			path,
			label,
			durationSec,
		});
		const assetId = document.project.primaryAssetId ?? document.assets.at(-1)?.id ?? "";
		return { assetId, document };
	}

	async generateImageScene(
		projectId: string,
		sessionId: string,
		prompt: string,
	): Promise<AiEditionGeneratedSceneResult> {
		if (!this.options.selectSession(projectId, sessionId))
			throw new Error("Chat session unavailable.");
		await this.options.documents.getProject(projectId);
		const image = await (await getCodexAppServer()).generateImage(prompt);
		const { app } = await import("electron");
		const paths = await saveGeneratedImage(app.getPath("userData"), projectId, image);
		try {
			await encodeStillScene(paths.imagePath, paths.videoPath);
		} catch (error) {
			throw new Error(
				`The original image was saved at ${paths.imagePath}, but its video clip could not be created: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
		const messages = appendGeneratedScene(projectId, sessionId, prompt.trim(), paths.imagePath);
		return { ...paths, ...messages };
	}

	async removeAsset(projectId: string, assetId: string): Promise<AiEditionAssetResult> {
		const document = await this.options.documents.removeAsset(projectId, assetId);
		return { assetId, document };
	}

	async llmGetSnapshot(): Promise<AiEditionLlmSnapshot> {
		const config = this.llmConfig.getConfig();
		const credentialSummary: AiEditionLlmSnapshot["credentialSummary"] = [];
		const connectedProviders: string[] = [];
		const subscriptions: Record<string, AiEditionSubscriptionStatus> = {};
		for (const def of PROVIDER_DEFINITIONS) {
			if (def.authKind === "subscription" || def.authKind === "cli") {
				const status = await this.llmSubscriptionStatus(def.id, false);
				subscriptions[def.id] = status;
				if (status.connected) connectedProviders.push(def.id);
				credentialSummary.push({
					providerId: def.id,
					connected: status.connected,
					authKind: def.authKind,
					credentialKind: status.connected ? def.authKind : null,
				});
				continue;
			}
			const resolved = this.llmConfig.getCredential(def.id, def.envKeys);
			const connected = Boolean(resolved);
			if (connected) connectedProviders.push(def.id);
			credentialSummary.push({
				providerId: def.id,
				connected,
				authKind: def.authKind,
				credentialKind: resolved ? resolved.entry.kind : null,
			});
		}
		return {
			config,
			subscriptions,
			connectedProviders,
			availableProviders: PROVIDER_DEFINITIONS.map((d) => ({
				id: d.id,
				label: d.label,
				authKind: d.authKind,
			})),
			credentialSummary,
		};
	}

	async llmSetConfig(config: AiEditionLlmConfig): Promise<AiEditionDocumentResult> {
		try {
			if (config.provider === "claude-local") {
				const status = await (await getClaudeCli()).status(true);
				if (!status.connected)
					return {
						success: false,
						error: status.error ?? "Sign in through the official Claude Code CLI first.",
					};
			}
			if (
				config.provider === "codex-subscription" &&
				!(await this.llmSubscriptionStatus(config.provider)).connected
			) {
				return { success: false, error: "Connect your ChatGPT subscription before selecting it." };
			}
			await this.llmConfig.setConfig(config);
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	async llmSetApiKey(providerId: string, apiKey: string): Promise<AiEditionDocumentResult> {
		try {
			if (providerId === "claude-local")
				return {
					success: false,
					error:
						"Manage Claude authentication in the official CLI. PurplePrint Studio does not store its credentials.",
				};
			if (providerId === "codex-subscription")
				return { success: false, error: "Use ChatGPT sign-in, not an API key." };
			const entry: LlmCredential = { kind: "api-key", apiKey };
			await this.llmConfig.setCredential(providerId, entry);
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	async llmRemoveApiKey(providerId: string): Promise<AiEditionDocumentResult> {
		try {
			await this.llmConfig.removeCredential(providerId);
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	async llmDisconnect(providerId: string): Promise<AiEditionLlmDisconnectResult> {
		// A local CLI is shared with the user's other apps. Deselect it without logging it out.
		if (providerId === "codex-subscription") await (await getCodexAppServer()).logout();
		await this.llmConfig.removeCredential(providerId);
		const active = this.llmConfig.getConfig();
		if (active?.provider === providerId) {
			await this.llmConfig.setConfig({
				provider: "",
				model: "",
			});
		}
		return { success: true, snapshot: await this.llmGetSnapshot() };
	}

	async llmListProviderModels(providerId: string): Promise<AiEditionLlmProviderModelsResult> {
		try {
			if (providerId === "claude-local") {
				const catalog = await (await getClaudeCli()).models();
				return { models: catalog.map((model) => model.id), catalog };
			}
			if (providerId === "codex-subscription") {
				const runtime = await getCodexAppServer();
				if (!(await runtime.status()).connected) return { models: [], error: "Not connected" };
				const catalog = await runtime.models();
				return { models: catalog.map((model) => model.id), catalog };
			}
			const def = PROVIDER_DEFINITIONS.find((d) => d.id === providerId);
			if (!def) return { models: [], error: `Unknown provider ${providerId}` };
			const cred = this.llmConfig.getCredential(providerId, def.envKeys);
			if (!cred) return { models: [], error: "Not connected" };
			const config = this.llmConfig.getConfig();
			const baseUrl = (config?.provider === providerId ? config.baseUrl : undefined) ?? def.baseUrl;

			if (providerId === "anthropic") {
				return { models: await listAnthropicModels(cred.value) };
			}
			if (providerId === "google") {
				return { models: await listGoogleModels(cred.value) };
			}
			if (providerId === "mistral") {
				return { models: await listMistralModels(cred.value) };
			}
			if (providerId === "openrouter") {
				return { models: await listOpenRouterModels() };
			}
			if (providerId === "minimax" || providerId === "minimax-token-plan") {
				return { models: await probeMiniMaxModels(cred.value, baseUrl) };
			}
			if (providerId === "openai" || providerId === "openai-compatible") {
				if (!baseUrl) return { models: [], error: "Missing base URL" };
				const models = await listOpenAiCompatibleModels(baseUrl, cred.value);
				if (
					providerId !== "openai" ||
					baseUrl.trim().replace(/\/+$/, "") !== "https://api.openai.com/v1"
				)
					return { models };
				models.sort((a, b) => gpt6ModelOrder(a) - gpt6ModelOrder(b));
				const catalog: AiEditionLlmModelOption[] = GPT6_MODELS.filter((preferred) =>
					models.includes(preferred.id),
				).map((preferred) => ({
					...preferred,
					contextWindowTokens: resolveCodexContextWindow(preferred.id)?.tokens,
					contextWindowSource: "official",
				}));
				return { models, catalog };
			}
			return { models: [], error: `Provider ${providerId} does not expose a dynamic model list` };
		} catch (error) {
			return { models: [], error: error instanceof Error ? error.message : String(error) };
		}
	}

	async llmSubscriptionStatus(
		providerId: string,
		force = true,
	): Promise<AiEditionSubscriptionStatus> {
		if (providerId === "claude-local") return (await getClaudeCli()).status(force);
		if (providerId !== "codex-subscription")
			return { available: false, connected: false, error: "Unknown subscription provider." };
		try {
			return await (await getCodexAppServer()).status();
		} catch (error) {
			return {
				available: false,
				connected: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async llmSubscriptionLogin(providerId: string): Promise<AiEditionDocumentResult> {
		if (providerId !== "codex-subscription")
			return { success: false, error: "Unknown subscription provider." };
		try {
			const runtime = await getCodexAppServer();
			const { authUrl } = await runtime.login();
			const { shell } = await import("electron");
			try {
				await shell.openExternal(authUrl);
			} catch (error) {
				await runtime.cancelLogin();
				throw error;
			}
			return { success: true };
		} catch (error) {
			return { success: false, error: error instanceof Error ? error.message : String(error) };
		}
	}

	async llmSubscriptionCancelLogin(providerId: string): Promise<AiEditionDocumentResult> {
		if (providerId !== "codex-subscription")
			return { success: false, error: "Unknown subscription provider." };
		await (await getCodexAppServer()).cancelLogin();
		return { success: true };
	}

	async chatRun(
		projectId: string,
		sessionId: string,
		message: string,
		document?: unknown,
		sink?: ChatEventSink,
	): Promise<AiEditionChatResult> {
		return this.options.runChat(projectId, sessionId, message, document, sink);
	}

	chatUndoLastBatch(_projectId: string, _sessionId: string): AiEditionChatResult {
		return { success: false, error: "Per-tool-batch undo retired in favor of per-message rewind." };
	}

	chatRewindToMessage(
		projectId: string,
		sessionId: string,
		messageId: string,
	): AiEditionChatRewindResult | { success: false; error: string } {
		return this.options.rewindToMessage(projectId, sessionId, messageId);
	}

	chatContextUsage(projectId: string, sessionId: string): AiEditionChatBudget | null {
		const usage = this.options.getContextUsage(projectId, sessionId);
		if (!usage) return null;
		const budgetTokens = resolveContextBudget(this.llmConfig.getConfig()?.contextBudgetTokens);
		const ratio = usage.usedTokens / budgetTokens;
		return { ...usage, budgetTokens, ratio, fillPercent: Math.min(100, Math.round(ratio * 100)) };
	}

	chatCompactNow(projectId: string, sessionId: string): Promise<AiEditionChatCompactResult | null> {
		return this.options.compactNow(projectId, sessionId);
	}

	chatListSessions(projectId: string): AiEditionChatSessionSummary[] {
		return this.options.listSessions(projectId);
	}

	chatCreateSession(projectId: string, title?: string): AiEditionChatSessionSummary {
		return this.options.createSession(projectId, title);
	}

	chatSelectSession(projectId: string, sessionId: string): AiEditionChatSession | null {
		return this.options.selectSession(projectId, sessionId);
	}

	chatRenameSession(
		projectId: string,
		sessionId: string,
		title: string,
	): AiEditionChatSessionSummary | null {
		return this.options.renameSession(projectId, sessionId, title);
	}

	chatDeleteSession(projectId: string, sessionId: string): { success: boolean } {
		return { success: this.options.deleteSession(projectId, sessionId) };
	}

	chatMessages(projectId: string, sessionId: string): AiEditionChatMessage[] {
		const session = this.options.selectSession(projectId, sessionId);
		return session?.messages ?? [];
	}

	chatBudget(projectId: string, sessionId: string): AiEditionChatBudget | null {
		return this.chatContextUsage(projectId, sessionId);
	}

	async chatCompact(
		projectId: string,
		sessionId: string,
	): Promise<AiEditionChatCompactResult | null> {
		const result = await this.options.compactNow(projectId, sessionId);
		if (!result) return null;
		return result;
	}

	/**
	 * Translate transcript segments for the caption layer, using whichever
	 * provider/model the chat is already configured with. Returns a plain
	 * `segmentId → text` map: the caller writes it into the document's caption
	 * translation layer, so nothing here can touch the transcript SSOT.
	 */
	async captionsTranslate(input: {
		segments: CaptionTranslateSegment[];
		targetLanguage: string;
		sourceLanguage?: string;
	}): Promise<AiEditionCaptionTranslateResult> {
		const config = this.llmConfig.getConfig();
		if (!config) {
			return {
				success: false,
				segments: {},
				error: "No AI provider is configured. Connect one in the agent settings first.",
			};
		}
		const def = PROVIDER_DEFINITIONS.find((d) => d.id === config.provider);
		const credential = def ? this.llmConfig.getCredential(def.id, def.envKeys) : null;
		const result = await translateCaptionSegments({
			segments: input.segments,
			targetLanguage: input.targetLanguage,
			sourceLanguage: input.sourceLanguage,
			provider: config.provider,
			model: config.model,
			apiKey: credential?.value ?? "",
			baseUrl: config.baseUrl,
			reasoningEffort: config.reasoningEffort,
		});
		return { ...result, model: config.model };
	}
}
