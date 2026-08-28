import { ArrowLeft, Check, Film, MessageSquare, Plus, Search, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useEditorDialogActions, useEditorDialogSection } from "@/contexts/EditorDialogsContext";
import { useScopedT } from "@/contexts/I18nContext";
import type { AxcutAsset } from "@/lib/ai-edition/schema";
import {
	applyAgentDocumentIfCurrent,
	runAgentTurn,
} from "@/lib/ai-edition/store/agentDocumentApply";
import { useProjectStore } from "@/lib/ai-edition/store/projectStore";
import {
	useAssetTranscriptions,
	useTranscriptionStore,
} from "@/lib/ai-edition/store/transcriptionStore";
import { useChatPromptBus } from "@/lib/ai-edition/store/useChatPromptBus";
import { splitRoundedTime } from "@/lib/ai-edition/timeline/format";
import type { AssetTranscriptionView } from "@/lib/ai-edition/transcription/status";
import { nativeBridgeClient } from "@/native/client";
import type {
	AiEditionChatEvent,
	AiEditionLlmConfig,
	AiEditionLlmModelOption,
} from "@/native/contracts";
import { formatBytes } from "@/utils/formatBytes";
import {
	getReasoningEffortLabel,
	getReasoningEffortOptions,
	PROVIDER_DEFINITIONS,
	type ReasoningEffort,
} from "../../../electron/ai-edition/provider-registry";
import { type ChatDisplayMessage, ChatMessage } from "./ChatMessage";
import { ChatWelcome } from "./ChatWelcome";
import { ContextBudgetDialog } from "./ContextBudgetDialog";
import { canSendChat } from "./chatAvailability";
import { ChatHistoryModal, SourceTranscriptModal } from "./Modals";
import styles from "./NewEditorShell.module.css";
import { TranscriptionStatusDot } from "./TranscriptionStatus";
import { useChatBudget } from "./useChatBudget";

export type LeftTab = "chat" | "media";

const THUMB_PALETTE = ["thumbRed", "thumbGreen", "thumbAmber", "thumbCyan"] as const;

// `h:mm:ss.t`, hours always shown — a third shape, so it formats itself rather
// than calling into format.ts. It shares `splitRoundedTime` because the carry is
// the part that must not be re-derived: deriving the minute field from the raw
// value while the second field rounded is what rendered `0:00:60.0`.
function formatTimecode(sec: number | undefined): string {
	if (!sec || !Number.isFinite(sec)) return "0:00:00.0";
	const { totalMinutes, seconds } = splitRoundedTime(sec);
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	// padStart(4), not (3): "5.0" is already 3 chars, so a single-digit second
	// rendered as `0:00:5.0` instead of `0:00:05.0`.
	return `${h}:${m.toString().padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function basename(path: string): string {
	return path.split(/[\\/]/).pop() ?? path;
}

function MediaList({
	assets,
	onOpenTranscript,
	transcriptions,
}: {
	assets: AxcutAsset[];
	onOpenTranscript?: (asset: AxcutAsset) => void;
	/** Per-asset transcription state, keyed by asset id (see transcriptionStore). */
	transcriptions: Record<string, AssetTranscriptionView>;
}) {
	const t = useScopedT("editor");
	if (assets.length === 0) {
		return (
			<p
				style={{
					font: "400 12px var(--font-body)",
					color: "var(--muted)",
					padding: "16px var(--sp-4)",
					textAlign: "center",
					lineHeight: 1.5,
				}}
			>
				{t("leftPanel.emptyHint")}
			</p>
		);
	}
	return (
		<ul className={styles.mediaList}>
			{assets.map((asset, i) => {
				const label = asset.label || basename(asset.originalPath);
				const tc = formatTimecode(asset.durationSec);
				const size = formatBytes(asset.sizeBytes);
				const palette = THUMB_PALETTE[i % THUMB_PALETTE.length];
				const transcription = transcriptions[asset.id] ?? {
					assetId: asset.id,
					status: "idle" as const,
				};

				return (
					<li
						className={styles.mediaCard}
						key={asset.id}
						title={asset.originalPath}
						draggable
						onDragStart={(e) => {
							e.dataTransfer.setData("application/x-axcut-asset", asset.id);
							e.dataTransfer.effectAllowed = "copy";
						}}
					>
						<button
							type="button"
							style={{
								display: "flex",
								flexDirection: "column",
								border: 0,
								background: "none",
								padding: 0,
								cursor: "pointer",
								font: "inherit",
								textAlign: "left",
								width: "100%",
							}}
							onClick={() => onOpenTranscript?.(asset)}
						>
							<div className={`${styles.thumb} ${styles[palette]}`} aria-hidden>
								<Film size={22} />
							</div>
							<div className={styles.mediaMeta}>
								<div className={styles.name}>{label}</div>
								<div className={styles.row}>
									<TranscriptionStatusDot view={transcription} />
									<span className={styles.timecode}>{tc}</span>
									<span className={styles.size}>{size}</span>
								</div>
							</div>
						</button>
					</li>
				);
			})}
		</ul>
	);
}

export function MediaPane() {
	const t = useScopedT("editor");
	const projectId = useProjectStore((s) => s.projectId);
	const document = useProjectStore((s) => s.document);
	const addAsset = useProjectStore((s) => s.addAsset);
	// Transcripts land on their own (transcriptionStore's background pass); the
	// pane reports where each one is at and offers a per-asset re-run.
	const transcriptions = useAssetTranscriptions();
	const requestTranscription = useTranscriptionStore((s) => s.request);
	const [query, setQuery] = useState("");
	const [busy, setBusy] = useState(false);
	const [srcTranscriptAsset, setSrcTranscriptAsset] = useState<AxcutAsset | null>(null);
	const selectedTranscription = srcTranscriptAsset
		? transcriptions[srcTranscriptAsset.id]
		: undefined;

	const handleImport = async () => {
		if (!projectId) {
			toast.error(t("mediaStage.openProjectFirst"));
			return;
		}
		const picker = await window.electronAPI?.openVideoFilePicker();
		if (!picker?.success || !picker.path) return;
		setBusy(true);
		try {
			const label = picker.name || basename(picker.path);
			await addAsset(picker.path, label);
			toast.success(t("mediaStage.added", { label }));
		} catch (err) {
			toast.error(t("mediaStage.couldNotAddAsset"), {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setBusy(false);
		}
	};

	const filtered = (document?.assets ?? []).filter((a) => {
		if (!query) return true;
		const text = `${a.label} ${a.originalPath}`.toLowerCase();
		return text.includes(query.toLowerCase());
	});

	return (
		<aside className={styles.panel}>
			<header className={styles.panelHead}>
				<h2>{t("leftPanel.mediaTitle")}</h2>
			</header>
			<div style={{ padding: "10px var(--sp-3) 8px" }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "6px 10px",
						background: "var(--surface-warm)",
						border: "1px solid var(--border-soft)",
						borderRadius: "var(--r-md)",
						color: "var(--meta)",
					}}
				>
					<Search size={14} />
					<input
						type="text"
						placeholder={t("leftPanel.searchPlaceholder")}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						style={{
							flex: 1,
							border: 0,
							background: "transparent",
							outline: "none",
							font: "13px var(--font-body)",
							color: "var(--fg)",
						}}
					/>
					{query ? (
						<button
							type="button"
							onClick={() => setQuery("")}
							aria-label={t("leftPanel.clearSearch")}
							style={{
								background: "transparent",
								border: 0,
								color: "var(--meta)",
								cursor: "pointer",
							}}
						>
							<X size={12} />
						</button>
					) : null}
				</div>
			</div>
			<div className={styles.panelBody} style={{ padding: "4px var(--sp-3) 8px" }}>
				<MediaList
					assets={filtered}
					onOpenTranscript={setSrcTranscriptAsset}
					transcriptions={transcriptions}
				/>
			</div>
			<button
				type="button"
				className={styles.importBtn}
				onClick={handleImport}
				disabled={!projectId || busy}
			>
				<Plus size={14} />
				{t("mediaStage.importMedia")}
			</button>
			{document?.transcript ? (
				<div
					style={{
						margin: "0 var(--sp-3) 8px",
						padding: "6px 10px",
						borderRadius: 999,
						background: "var(--success-soft)",
						color: "var(--success)",
						font: "500 11px/1 var(--font-mono)",
						letterSpacing: "0.04em",
						display: "inline-flex",
						alignItems: "center",
						gap: 6,
					}}
				>
					<span
						style={{
							width: 6,
							height: 6,
							borderRadius: "50%",
							background: "var(--success)",
						}}
					/>
					{t("leftPanel.transcriptReadyBadge")}
				</div>
			) : null}
			<SourceTranscriptModal
				open={srcTranscriptAsset !== null}
				onClose={() => setSrcTranscriptAsset(null)}
				assetLabel={srcTranscriptAsset?.label ?? ""}
				assetPath={srcTranscriptAsset?.originalPath ?? ""}
				tcFormatted={formatTimecode(srcTranscriptAsset?.durationSec)}
				transcript={
					srcTranscriptAsset && document?.transcripts
						? (document.transcripts.find((t) => t.assetId === srcTranscriptAsset.id) ?? null)
						: null
				}
				isTranscribing={
					selectedTranscription?.status === "running" || selectedTranscription?.status === "queued"
				}
				isFailed={selectedTranscription?.status === "failed"}
				failureMessage={
					selectedTranscription?.failure
						? selectedTranscription.failure.kind === "error"
							? selectedTranscription.failure.message
							: t("mediaStage.noAudioTrackHint")
						: undefined
				}
				onRegenerate={(language) => {
					if (!srcTranscriptAsset) return Promise.resolve();
					return requestTranscription(srcTranscriptAsset.id, language);
				}}
			/>
		</aside>
	);
}

export function LeftPanel({ active }: { active: LeftTab }) {
	return active === "chat" ? <ChatStripPanel /> : <MediaPane />;
}

// Quick-access model picker anchored to the composer's model pill — mirrors
// axcut's LlmPopover in "models"/"providers" mode (a lightweight popover, not
// the full AI-settings modal). "Provider settings…" in the providers screen
// is the escape hatch into that full modal (same one the header gear opens),
// matching axcut's `openProviderSettings` from its popover's providers screen.
function ModelQuickPopover({
	anchorRect,
	llmConfig,
	connectedProviders,
	onClose,
	onConfigChange,
	onOpenFullSettings,
}: {
	anchorRect: { left: number; bottom: number; maxHeight: number };
	llmConfig: AiEditionLlmConfig;
	connectedProviders: string[];
	onClose: () => void;
	onConfigChange: () => void;
	onOpenFullSettings: () => void;
}) {
	const t = useScopedT("editor");
	const tc = useScopedT("common");
	const [screen, setScreen] = useState<"models" | "providers">("models");
	const [browseProviderId, setBrowseProviderId] = useState(llmConfig.provider);
	const [models, setModels] = useState<string[]>([]);
	const [catalog, setCatalog] = useState<AiEditionLlmModelOption[]>([]);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [modelsError, setModelsError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [busy, setBusy] = useState(false);

	const browseDef = PROVIDER_DEFINITIONS.find((d) => d.id === browseProviderId);

	useEffect(() => {
		if (screen !== "models" || !browseProviderId) return;
		let cancelled = false;
		setModelsLoading(true);
		setModelsError(null);
		setModels([]);
		setCatalog([]);
		void nativeBridgeClient.aiEdition
			.llmListProviderModels(browseProviderId)
			.then((result) => {
				if (cancelled) return;
				setModels(result.models);
				setCatalog(result.catalog ?? []);
				setModelsError(result.error ?? null);
			})
			.catch((err) => {
				if (cancelled) return;
				setModels([]);
				setModelsError(err instanceof Error ? err.message : String(err));
			})
			.finally(() => {
				if (!cancelled) setModelsLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [screen, browseProviderId]);

	const selectModel = async (nextModel: string) => {
		setBusy(true);
		try {
			const result = await nativeBridgeClient.aiEdition.llmSetConfig({
				...llmConfig,
				provider: browseProviderId,
				model: nextModel,
			});
			if (result.success) {
				onConfigChange();
				onClose();
			} else {
				setModelsError(result.error ?? t("chat.selectModelFailed"));
			}
		} finally {
			setBusy(false);
		}
	};

	const modelInfo = new Map(catalog.map((model) => [model.id, model]));
	const filteredModels = search.trim()
		? models.filter((candidate) =>
				[candidate, modelInfo.get(candidate)?.label, modelInfo.get(candidate)?.resolvedModel].some(
					(value) => value?.toLowerCase().includes(search.trim().toLowerCase()),
				),
			)
		: models;

	return createPortal(
		<div
			role="dialog"
			aria-modal="true"
			style={{ position: "fixed", inset: 0, zIndex: 999 }}
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) onClose();
			}}
		>
			<section
				style={{
					position: "fixed",
					left: anchorRect.left,
					bottom: anchorRect.bottom,
					width: 320,
					maxHeight: anchorRect.maxHeight,
					display: "flex",
					flexDirection: "column",
					background: "var(--surface)",
					border: "1px solid var(--border)",
					borderRadius: "var(--r-md)",
					boxShadow: "var(--elev-pop)",
					zIndex: 1000,
					overflow: "hidden",
				}}
			>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "10px 12px",
						borderBottom: "1px solid var(--border-soft)",
					}}
				>
					<button
						type="button"
						onClick={() => setScreen(screen === "models" ? "providers" : "models")}
						style={{
							display: "flex",
							alignItems: "center",
							gap: 6,
							background: "transparent",
							border: "none",
							color: "var(--fg-2)",
							cursor: "pointer",
							fontSize: 12.5,
							padding: 0,
						}}
					>
						<ArrowLeft size={14} />
						{screen === "models" ? t("chat.changeProvider") : t("chat.back")}
					</button>
					<button
						type="button"
						onClick={onClose}
						aria-label={tc("actions.close")}
						style={{
							background: "transparent",
							border: "none",
							color: "var(--muted)",
							cursor: "pointer",
							padding: 0,
						}}
					>
						<X size={14} />
					</button>
				</div>
				<div style={{ overflowY: "auto", padding: 10, minHeight: 0, flex: 1 }}>
					{screen === "models" ? (
						<>
							<div style={{ marginBottom: 8 }}>
								<div style={{ fontWeight: 600, fontSize: 13 }}>
									{browseDef?.label ?? browseProviderId}
								</div>
								<div style={{ fontSize: 11.5, color: "var(--muted)" }}>
									{t("chat.currentModel")}{" "}
									{browseProviderId === llmConfig.provider
										? (modelInfo.get(llmConfig.model)?.label ?? llmConfig.model)
										: (browseDef?.defaultModel ?? t("chat.notSelected"))}
								</div>
							</div>
							<input
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								placeholder={modelsLoading ? t("chat.loadingModels") : t("chat.searchModels")}
								disabled={modelsLoading || !models.length}
								style={{
									width: "100%",
									padding: "6px 8px",
									marginBottom: 8,
									borderRadius: "var(--r-sm)",
									border: "1px solid var(--border)",
									background: "var(--bg)",
									color: "var(--fg)",
								}}
							/>
							{!models.length ? (
								<div style={{ fontSize: 12, color: "var(--muted)", padding: "8px 0" }}>
									{modelsLoading
										? t("chat.loadingModels")
										: modelsError
											? t("chat.fetchModelsFailed", { error: modelsError })
											: t("chat.noModelsAvailable")}
								</div>
							) : (
								<div>
									{filteredModels.map((candidate) => (
										<button
											key={candidate}
											type="button"
											disabled={busy || modelsLoading}
											title={modelInfo.get(candidate)?.description}
											onClick={() => void selectModel(candidate)}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												width: "100%",
												padding: "7px 8px",
												border: "none",
												borderRadius: "var(--r-sm)",
												background:
													candidate === llmConfig.model && browseProviderId === llmConfig.provider
														? "var(--surface-3)"
														: "transparent",
												color: "var(--fg)",
												cursor: "pointer",
												fontSize: 12.5,
												marginBottom: 2,
											}}
										>
											{modelInfo.get(candidate)?.label ?? candidate}
											{candidate === llmConfig.model && browseProviderId === llmConfig.provider ? (
												<Check size={12} />
											) : null}
										</button>
									))}
									{filteredModels.length === 0 ? (
										<div style={{ fontSize: 12, color: "var(--muted)" }}>
											{t("chat.noModelsMatch")}
										</div>
									) : null}
								</div>
							)}
						</>
					) : (
						<>
							{connectedProviders.map((providerId) => {
								const def = PROVIDER_DEFINITIONS.find((d) => d.id === providerId);
								if (!def) return null;
								return (
									<button
										key={providerId}
										type="button"
										onClick={() => {
											setBrowseProviderId(providerId);
											setScreen("models");
										}}
										style={{
											display: "flex",
											flexDirection: "column",
											alignItems: "flex-start",
											width: "100%",
											padding: "8px 10px",
											border: "none",
											borderRadius: "var(--r-sm)",
											background:
												providerId === browseProviderId ? "var(--surface-3)" : "transparent",
											color: "var(--fg)",
											cursor: "pointer",
											marginBottom: 4,
										}}
									>
										<strong style={{ fontSize: 12.5 }}>{def.label}</strong>
										<span style={{ fontSize: 11, color: "var(--muted)" }}>
											{providerId === llmConfig.provider ? llmConfig.model : def.defaultModel}
										</span>
									</button>
								);
							})}
							{connectedProviders.length === 0 ? (
								<div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
									{t("chat.noProvidersConnected")}
								</div>
							) : null}
							<button
								type="button"
								onClick={() => {
									onClose();
									onOpenFullSettings();
								}}
								style={{
									display: "flex",
									alignItems: "center",
									gap: 6,
									width: "100%",
									padding: "8px 10px",
									border: "1px solid var(--border-soft)",
									borderRadius: "var(--r-sm)",
									background: "transparent",
									color: "var(--fg-2)",
									cursor: "pointer",
									marginTop: 6,
								}}
							>
								{t("chat.providerSettings")}
							</button>
						</>
					)}
				</div>
			</section>
		</div>,
		document.body,
	);
}

function ChatStripPanel() {
	const t = useScopedT("editor");
	const tc = useScopedT("common");
	// The Auto-enhance confirmation is timeline-owned copy, fired from here —
	// see the prompt-bus effect below.
	const tTimeline = useScopedT("timeline");
	const projectId = useProjectStore((s) => s.projectId);
	const [messages, setMessages] = useState<ChatDisplayMessage[]>([]);
	const [input, setInput] = useState("");
	const [busy, setBusy] = useState(false);
	const [llmConfig, setLlmConfig] = useState<AiEditionLlmConfig | null>(null);
	// The dialog itself is mounted in App.tsx so the app menu can reach it from every mode
	// (issue #420); this panel only asks for it to be opened, and watches it close.
	const dialogSection = useEditorDialogSection();
	const { openDialog } = useEditorDialogActions();
	const providerSettingsOpen = dialogSection === "providers";
	const openProviderSettings = useCallback(() => openDialog("providers"), [openDialog]);
	const [chatsOpen, setChatsOpen] = useState(false);
	const [sessions, setSessions] = useState<
		Array<{ id: string; title: string; messageCount: number; createdAt: string }>
	>([]);
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
	// Mirror in a ref so refreshSessions can read the current selection without
	// listing activeSessionId in its deps — otherwise refreshSessions is recreated
	// on every selection change, which re-runs the project effect below (with
	// preferFirst=true) and forces the selection back to list[0]. That feedback
	// loop is what made "new conversation" jump to the oldest chat instead of the
	// freshly-created empty one.
	const activeSessionIdRef = useRef<string | null>(activeSessionId);
	activeSessionIdRef.current = activeSessionId;
	const scrollRef = useRef<HTMLDivElement | null>(null);
	// ponytail: live reasoning trace for the in-flight turn. Reset at send()
	// start; deltas append through the chat-event subscription; once the run
	// resolves we copy it onto the assistant message and clear it.
	const [thinkingText, setThinkingText] = useState("");
	const [streamText, setStreamText] = useState("");
	const projectIdRef = useRef(projectId);
	projectIdRef.current = projectId;
	const activeRunRef = useRef<{
		projectId: string;
		sessionId: string | null;
		text: string;
		thinking: string;
	} | null>(null);
	const flushFrameRef = useRef<number | null>(null);
	const followLatestRef = useRef(true);
	const [contextBudgetOpen, setContextBudgetOpen] = useState(false);
	const [reasoningOpen, setReasoningOpen] = useState(false);
	const reasoningButtonRef = useRef<HTMLButtonElement | null>(null);
	const [reasoningMenuRect, setReasoningMenuRect] = useState<{
		left: number;
		bottom: number;
	} | null>(null);
	const [reasoningBusy, setReasoningBusy] = useState(false);
	// null until the first llmGetSnapshot() lands: "unknown", not "none".
	const [connectedProviders, setConnectedProviders] = useState<string[] | null>(null);
	const [activeModelCatalog, setActiveModelCatalog] = useState<AiEditionLlmModelOption[]>([]);
	// unknown ≠ none; see chatAvailability.ts.
	const canChat = canSendChat(llmConfig, connectedProviders);
	const [modelPopoverOpen, setModelPopoverOpen] = useState(false);
	const modelButtonRef = useRef<HTMLButtonElement | null>(null);
	const [modelPopoverRect, setModelPopoverRect] = useState<{
		left: number;
		bottom: number;
		maxHeight: number;
	} | null>(null);

	const refreshLlm = useCallback(async () => {
		try {
			const snap = await nativeBridgeClient.aiEdition.llmGetSnapshot();
			setLlmConfig(snap.config);
			setConnectedProviders(snap.connectedProviders);
		} catch {
			// ponytail: silent
		}
	}, []);

	const refreshSessions = useCallback(async (pid: string, preferFirst = false) => {
		try {
			const list = await nativeBridgeClient.aiEdition.chatListSessions(pid);
			if (projectIdRef.current !== pid) return;
			setSessions(list);
			if (list.length === 0) {
				setActiveSessionId(null);
				setMessages([]);
				return;
			}
			if (preferFirst || !list.some((s) => s.id === activeSessionIdRef.current)) {
				setActiveSessionId(list[0].id);
			}
		} catch {
			// ponytail: silent — shim mode or missing project
		}
	}, []);

	// On mount, and again every time the provider dialog closes. Connecting a provider there is
	// what makes the composer usable here and what fills the model pill, and the dialog no
	// longer hangs off this component, so there is no onClose to do it from. "Not open" covers
	// both events at once, which is why there is no ref here watching for the falling edge.
	useEffect(() => {
		if (!providerSettingsOpen) void refreshLlm();
	}, [providerSettingsOpen, refreshLlm]);

	useEffect(() => {
		setActiveModelCatalog([]);
		if (providerSettingsOpen || llmConfig?.provider !== "claude-local") return;
		let cancelled = false;
		void nativeBridgeClient.aiEdition
			.llmListProviderModels(llmConfig.provider)
			.then((result) => {
				if (!cancelled) setActiveModelCatalog(result.catalog ?? []);
			})
			.catch(() => {
				/* Keep the saved model ID visible when discovery is unavailable. */
			});
		return () => {
			cancelled = true;
		};
	}, [llmConfig?.provider, providerSettingsOpen]);

	// Coalesce IPC chunks into one visual update per frame. The final RPC response
	// replaces the live row; refs keep the final text/reasoning out of stale closures.
	useEffect(() => {
		const unsubscribe = window.electronAPI.onAiEditionChatEvent((event: AiEditionChatEvent) => {
			const run = activeRunRef.current;
			if (!run || event.sessionId !== run.sessionId || projectIdRef.current !== run.projectId)
				return;
			if (event.kind === "text") run.text += event.delta;
			else if (event.kind === "thinking") run.thinking += event.delta;
			else return;
			if (flushFrameRef.current !== null) return;
			flushFrameRef.current = requestAnimationFrame(() => {
				flushFrameRef.current = null;
				if (activeRunRef.current !== run) return;
				setStreamText(run.text);
				setThinkingText(run.thinking);
			});
		});
		return () => {
			unsubscribe();
			activeRunRef.current = null;
			if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current);
		};
	}, []);

	useEffect(() => {
		activeRunRef.current = null;
		if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current);
		flushFrameRef.current = null;
		setStreamText("");
		setThinkingText("");
		setBusy(false);
		followLatestRef.current = true;
		setSessions([]);
		setActiveSessionId(null);
		activeSessionIdRef.current = null;
		setMessages([]);
		if (!projectId) return;
		void refreshSessions(projectId, true);
	}, [projectId, refreshSessions]);

	useEffect(() => {
		if (!projectId || !activeSessionId) {
			setMessages([]);
			return;
		}
		followLatestRef.current = true;
		if (activeRunRef.current?.sessionId === activeSessionId) return;
		let cancelled = false;
		void (async () => {
			try {
				const session = await nativeBridgeClient.aiEdition.chatSelectSession(
					projectId,
					activeSessionId,
				);
				if (cancelled || activeRunRef.current?.sessionId === activeSessionId) return;
				if (session) {
					setMessages(
						session.messages.map((m) => ({
							id: m.id,
							role: m.role,
							content: m.content,
							time: m.createdAt,
							toolCalls: m.toolCalls,
							checkpointId: m.checkpointId ?? null,
						})),
					);
				} else {
					setMessages([]);
				}
			} catch {
				// ponytail: silent — shim mode
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [projectId, activeSessionId]);

	// Do not pull a reader back to the bottom while they inspect an earlier message.
	// biome-ignore lint/correctness/useExhaustiveDependencies: content changes trigger scrolling.
	useEffect(() => {
		if (followLatestRef.current)
			scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "auto" });
	}, [messages, streamText, thinkingText, busy]);

	const send = async (overrideText?: string) => {
		const text = (overrideText ?? input).trim();
		if (!projectId || !text || busy || activeRunRef.current) return;
		// ponytail: nothing to talk to. Bounce to the settings modal instead of
		// firing a doomed request. The composer is disabled in this state too,
		// but Auto-enhance calls send() directly and Enter can slip through.
		if (!canChat) {
			toast.error(t("chat.composerDisabledNoProvider"));
			openProviderSettings();
			return;
		}
		setInput("");
		setBusy(true);
		const run = { projectId, sessionId: activeSessionId, text: "", thinking: "" };
		activeRunRef.current = run;
		followLatestRef.current = true;
		setStreamText("");
		setThinkingText("");
		const optimisticUserId = `local_${Date.now()}_u`;
		setMessages((prev) => [
			...prev,
			{
				id: optimisticUserId,
				role: "user",
				content: text,
				time: new Date().toISOString(),
				checkpointId: null,
			},
		]);
		try {
			// Mirror axcut's `getOrCreateSession`: the composer works with zero
			// setup, so the first message on a project with no sessions yet
			// silently starts one instead of no-op'ing.
			let sessionId = activeSessionId;
			if (!sessionId) {
				const created = await nativeBridgeClient.aiEdition.chatCreateSession(projectId);
				sessionId = created.id;
				if (activeRunRef.current !== run || projectIdRef.current !== projectId) return;
				activeSessionIdRef.current = sessionId;
				setSessions((prev) => [...prev, created]);
				setActiveSessionId(sessionId);
			}
			run.sessionId = sessionId;
			// Send the current document snapshot so the agent can run edit tools
			// against it (P1). Falls back to text-only chat when no doc is open.
			// `runAgentTurn` reads the document AND the revision it is at from one snapshot
			// before the turn starts, so a manual edit landing while the agent works is
			// detectable when its answer comes back.
			const { result, applyDocument } = await runAgentTurn((documentSnapshot) =>
				nativeBridgeClient.aiEdition.chatRun(projectId, sessionId, text, documentSnapshot),
			);
			if (activeRunRef.current !== run || projectIdRef.current !== projectId) return;
			const assistant = result.assistantMessage;
			if (result.success && assistant) {
				if (result.document) {
					const applyEdits = async (options?: { ignoreConflict?: boolean }) => {
						try {
							return await applyDocument(options);
						} catch (err) {
							// Only `ensureDocument` still throws here -- the agent handed back
							// something that is not a document. A failed WRITE does not reach this:
							// the store reports it itself and `applyDocument` answers "save-failed".
							toast.error(t("chat.applyEditsFailed"), {
								description: err instanceof Error ? err.message : String(err),
							});
							return "malformed" as const;
						}
					};
					const applyResult = await applyEdits();
					if (applyResult === "save-failed") {
						// The store has already said WHY the write failed, with the native error.
						// This says what it COST, without a description so the two do not repeat
						// each other: the assistant's "done, I removed 14 silences" renders either
						// way, so a bare save error next to it leaves the two unconnected.
						toast.error(t("chat.applyEditsFailed"));
					} else if (applyResult === "conflict") {
						// The turn is not lost, it is just not automatically applied: the document
						// is still in hand and the assistant's reply is about to be rendered as if
						// the edits had landed. The thing that usually moves `revision` here is a
						// background transcription finishing, not the user -- so dropping the whole
						// turn on the floor and blaming "the project changed" costs them a minute
						// of waiting and their tokens for something they never did. Let them take
						// it. No auto-dismiss: it is the only way back to this document.
						toast.warning(t("chat.agentEditConflict"), {
							duration: Number.POSITIVE_INFINITY,
							action: {
								label: t("chat.applyAnyway"),
								onClick: () => void applyEdits({ ignoreConflict: true }),
							},
						});
					}
				}
				if (activeRunRef.current !== run || projectIdRef.current !== projectId) return;
				setMessages((prev) => [
					...prev.map((m) =>
						m.id === optimisticUserId
							? {
									...m,
									id: result.userMessageCheckpointId ?? m.id,
									checkpointId: result.userMessageCheckpointId ?? null,
								}
							: m,
					),
					{
						id: assistant.id,
						role: "assistant",
						content: assistant.content,
						time: assistant.createdAt,
						toolCalls: assistant.toolCalls,
						thinking: run.thinking || undefined,
					},
				]);
				void refreshSessions(projectId);
			} else {
				throw new Error(result.error ?? t("chat.chatFailed"));
			}
		} catch (err) {
			if (activeRunRef.current !== run || projectIdRef.current !== projectId) return;
			if (run.text)
				setMessages((prev) => [
					...prev,
					{
						id: "partial_" + optimisticUserId,
						role: "assistant",
						content: run.text,
						thinking: run.thinking || undefined,
						time: new Date().toISOString(),
						interrupted: true,
					},
				]);
			toast.error(t("chat.chatFailed"), {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			if (activeRunRef.current === run) {
				activeRunRef.current = null;
				if (flushFrameRef.current !== null) cancelAnimationFrame(flushFrameRef.current);
				flushFrameRef.current = null;
				setBusy(false);
				setStreamText("");
				setThinkingText("");
			}
		}
	};

	// Auto-send a prompt handed over by another part of the UI (e.g. the
	// timeline's Auto-enhance → "Smart zooms + cuts with AI"). Routes through
	// the normal send() so sessions/checkpoints/rewind all keep working; the
	// message shows in the composer's history exactly as if typed.
	// The confirmation toast lives here because only this side knows the prompt
	// was taken — send() bounces it to the settings modal with no provider.
	// ponytail: one producer today, so the toast copy is assumed to be its own.
	// A second producer needs the bus to carry its confirmation string.
	const pendingPrompt = useChatPromptBus((s) => s.pending);
	const consumePrompt = useChatPromptBus((s) => s.consume);
	// biome-ignore lint/correctness/useExhaustiveDependencies: send() is intentionally not a dep (recreated each render); consume() clears `pending` so this fires once per queued prompt.
	useEffect(() => {
		if (!pendingPrompt || !projectId || busy) return;
		consumePrompt();
		if (canChat) toast.success(tTimeline("toolbar.aiEnhanceRequested"));
		void send(pendingPrompt);
	}, [pendingPrompt, projectId, busy, consumePrompt, canChat, tTimeline]);

	// ponytail: per-user-message rewind. Pops a confirmation popover, then
	// asks the main process to roll the session + document back to the
	// snapshot taken right before the user hit Send. axcut parity.
	const [rewindFor, setRewindFor] = useState<{
		messageId: string;
		anchor: { left: number; bottom: number } | null;
	} | null>(null);
	const openRewind = useCallback((messageId: string, button: HTMLButtonElement) => {
		const rect = button.getBoundingClientRect();
		setRewindFor({
			messageId,
			anchor: { left: rect.left + rect.width / 2, bottom: window.innerHeight - rect.top + 6 },
		});
	}, []);
	const confirmRewind = useCallback(
		async (messageId: string) => {
			if (!projectId || !activeSessionId) return;
			try {
				const result = await nativeBridgeClient.aiEdition.chatRewind(
					projectId,
					activeSessionId,
					messageId,
				);
				if (!result.success) {
					toast.error(result.error ?? t("chat.rewindFailed"));
					setRewindFor(null);
					return;
				}
				const doc = (result as { document?: unknown }).document;
				// No `expectedRevision`: a rewind REPLACES whatever is live, which is what the
				// confirmation dialog now says out loud -- including any manual edit made since.
				if (doc) await applyAgentDocumentIfCurrent(doc);
				setMessages(
					result.messages.map((m) => ({
						id: m.id,
						role: m.role,
						content: m.content,
						time: m.createdAt,
						toolCalls: m.toolCalls,
						checkpointId: m.checkpointId ?? null,
					})),
				);
				setInput(result.prompt);
				toast.success(t("chat.rewoundSuccess"));
			} catch (err) {
				toast.error(t("chat.rewindFailed"), {
					description: err instanceof Error ? err.message : String(err),
				});
			} finally {
				setRewindFor(null);
			}
		},
		[projectId, activeSessionId, t],
	);

	useEffect(() => {
		if (!rewindFor) return;
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target instanceof Element ? event.target : null;
			if (target?.closest("[data-rewind-confirmation], [data-rewind-trigger]")) {
				return;
			}
			setRewindFor(null);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setRewindFor(null);
		};
		globalThis.document.addEventListener("pointerdown", handlePointerDown);
		globalThis.document.addEventListener("keydown", handleKeyDown);
		return () => {
			globalThis.document.removeEventListener("pointerdown", handlePointerDown);
			globalThis.document.removeEventListener("keydown", handleKeyDown);
		};
	}, [rewindFor]);

	const modelLabel = llmConfig
		? (activeModelCatalog.find((model) => model.id === llmConfig.model)?.label ?? llmConfig.model)
		: t("chat.configureModel");
	const providerSupportsReasoning = Boolean(
		llmConfig &&
			PROVIDER_DEFINITIONS.find((d) => d.id === llmConfig.provider)?.supportsReasoningEffort,
	);
	const currentReasoningEffort: ReasoningEffort =
		(llmConfig?.reasoningEffort as ReasoningEffort | undefined) ?? "medium";
	const reasoningLabel =
		providerSupportsReasoning && llmConfig
			? getReasoningEffortLabel(llmConfig.provider, currentReasoningEffort)
			: null;

	const selectReasoningEffort = useCallback(
		async (effort: ReasoningEffort) => {
			if (!llmConfig) return;
			setReasoningBusy(true);
			try {
				const result = await nativeBridgeClient.aiEdition.llmSetConfig({
					...llmConfig,
					reasoningEffort: effort,
				});
				if (result.success) {
					setLlmConfig({ ...llmConfig, reasoningEffort: effort });
					setReasoningOpen(false);
				} else {
					toast.error(result.error ?? t("chat.reasoningEffortUpdateFailed"));
				}
			} catch (err) {
				toast.error(t("chat.reasoningEffortUpdateFailed"), {
					description: err instanceof Error ? err.message : String(err),
				});
			} finally {
				setReasoningBusy(false);
			}
		},
		[llmConfig, t],
	);

	const toggleReasoningOpen = useCallback(() => {
		setReasoningOpen((wasOpen) => {
			if (!wasOpen) {
				const rect = reasoningButtonRef.current?.getBoundingClientRect();
				if (rect) {
					setReasoningMenuRect({ left: rect.left, bottom: window.innerHeight - rect.top + 4 });
				}
			}
			return !wasOpen;
		});
	}, []);

	const toggleModelPopoverOpen = useCallback(() => {
		// Mirrors axcut's providerButtonRef handler: with no provider configured
		// yet there's nothing to quick-pick a model from, so go straight to the
		// full settings modal (the "providers" screen) instead of toggling a
		// popover that would render empty.
		if (!llmConfig) {
			openProviderSettings();
			return;
		}
		setModelPopoverOpen((wasOpen) => {
			if (!wasOpen) {
				const rect = modelButtonRef.current?.getBoundingClientRect();
				if (rect) {
					// The popover opens upward from the pill and can hold a long,
					// scrollable model list — cap its height to the space actually
					// available above the button so it never overflows off the top
					// of the window (only "bottom" is set; nothing clamps "top").
					setModelPopoverRect({
						left: rect.left,
						bottom: window.innerHeight - rect.top + 4,
						maxHeight: Math.max(160, rect.top - 12),
					});
				}
			}
			return !wasOpen;
		});
	}, [llmConfig, openProviderSettings]);

	// Prefer the main process's estimate of the windowed history it actually sends, so
	// manual compaction can shrink this meter while the complete transcript remains
	// visible. The renderer estimate is only shown until the first answer arrives --
	// including in web builds, where the shim answers with its own transcript estimate
	// rather than leaving the fallback in place.
	const budget = useChatBudget({
		projectId,
		sessionId: activeSessionId,
		messages,
		budgetTokens: llmConfig?.contextBudgetTokens,
	});

	const [compactNowPending, setCompactNowPending] = useState(false);
	const compactNow = useCallback(async () => {
		if (!projectId || !activeSessionId || compactNowPending || activeRunRef.current) return;
		setCompactNowPending(true);
		try {
			const result = await nativeBridgeClient.aiEdition.chatCompact(projectId, activeSessionId);
			if (!result) {
				toast.info(t("chat.notEnoughHistory"));
				return;
			}
			setMessages(
				result.session.messages.map((m) => ({
					id: m.id,
					role: m.role,
					content: m.content,
					time: m.createdAt,
					toolCalls: m.toolCalls,
					checkpointId: m.checkpointId ?? null,
				})),
			);
			toast.success(t("chat.compactedSuccess"));
		} catch (err) {
			toast.error(t("chat.compactFailed"), {
				description: err instanceof Error ? err.message : String(err),
			});
		} finally {
			setCompactNowPending(false);
		}
	}, [projectId, activeSessionId, compactNowPending, t]);

	const newChat = useCallback(async () => {
		if (!projectId || activeRunRef.current) return;
		try {
			const created = await nativeBridgeClient.aiEdition.chatCreateSession(projectId);
			setSessions((prev) => [...prev, created]);
			setActiveSessionId(created.id);
			setMessages([]);
		} catch (err) {
			toast.error(t("chat.createSessionFailed"), {
				description: err instanceof Error ? err.message : String(err),
			});
		}
	}, [projectId, t]);

	const selectSession = useCallback((id: string) => {
		if (activeRunRef.current) return;
		setActiveSessionId(id);
	}, []);

	const handleDelete = useCallback(
		async (id: string) => {
			if (!projectId || activeRunRef.current) return;
			try {
				const res = await nativeBridgeClient.aiEdition.chatDeleteSession(projectId, id);
				if (!res.success) return;
				setSessions((prev) => prev.filter((s) => s.id !== id));
				if (activeSessionId === id) {
					setActiveSessionId(null);
					setMessages([]);
				}
			} catch (err) {
				toast.error(t("chat.deleteSessionFailed"), {
					description: err instanceof Error ? err.message : String(err),
				});
			}
		},
		[projectId, activeSessionId, t],
	);

	const handleRename = useCallback(
		async (id: string, title: string) => {
			if (!projectId) return;
			const trimmed = title.trim();
			if (!trimmed) return;
			try {
				const updated = await nativeBridgeClient.aiEdition.chatRenameSession(
					projectId,
					id,
					trimmed,
				);
				if (updated) {
					setSessions((prev) => prev.map((s) => (s.id === id ? updated : s)));
				}
			} catch (err) {
				toast.error(t("chat.renameSessionFailed"), {
					description: err instanceof Error ? err.message : String(err),
				});
			}
		},
		[projectId, t],
	);

	// ponytail: inline session rename. Click the title to edit, Enter saves,
	// Escape cancels, blur saves when the value is non-empty (axcut parity).
	const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
	const [editingTitle, setEditingTitle] = useState("");
	const editingInputRef = useRef<HTMLInputElement | null>(null);
	const beginEditTitle = useCallback((id: string, currentTitle: string) => {
		setEditingSessionId(id);
		setEditingTitle(currentTitle);
	}, []);
	const cancelEditTitle = useCallback(() => {
		setEditingSessionId(null);
		setEditingTitle("");
	}, []);
	const commitEditTitle = useCallback(
		async (id: string) => {
			const next = editingTitle.trim();
			if (!next) {
				cancelEditTitle();
				return;
			}
			setEditingSessionId(null);
			await handleRename(id, next);
		},
		[editingTitle, handleRename, cancelEditTitle],
	);

	return (
		<aside className={styles.panel}>
			<div className={styles.panelHeader}>
				<div className={styles.chatStrip}>
					<div className={styles.chatStripRow}>
						<button
							type="button"
							aria-label={t("chat.contextSettings")}
							onClick={() => (llmConfig ? setContextBudgetOpen(true) : openProviderSettings())}
							className={styles.ctxPill}
							title={t("chat.contextTooltip", {
								usedTokens: budget.usedTokens.toLocaleString(),
								budgetTokens: budget.budgetTokens.toLocaleString(),
							})}
						>
							<span className={styles.d} aria-hidden />
							{t("chat.contextPercent", { percent: Math.min(100, Math.round(budget.ratio * 100)) })}
						</button>
						<span className={styles.stripActions}>
							<button
								type="button"
								title={t("chat.compactContext")}
								aria-label={t("chat.compactContext")}
								className={styles.iconBtn}
								onClick={() => void compactNow()}
								disabled={!activeSessionId || compactNowPending || busy}
							>
								<svg
									width={14}
									height={14}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									aria-hidden="true"
								>
									<path d="M8 4l4 4 4-4" />
									<path d="M8 20l4-4 4 4" />
									<path d="M6 12h12" />
								</svg>
							</button>
							<button
								type="button"
								title={t("chat.aiSettings")}
								aria-label={t("chat.aiSettings")}
								onClick={openProviderSettings}
							>
								<svg
									width={14}
									height={14}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<circle cx="12" cy="12" r="3" />
									<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
								</svg>
							</button>
							<button
								type="button"
								title={t("chat.history")}
								aria-label={t("chat.history")}
								onClick={() => setChatsOpen(true)}
								disabled={busy}
							>
								<svg
									width={14}
									height={14}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
									<path d="M3 3v5h5" />
									<path d="M12 7v5l4 2" />
								</svg>
							</button>
							<button
								type="button"
								title={t("chat.newConversation")}
								aria-label={t("chat.newConversation")}
								onClick={newChat}
								disabled={busy}
							>
								<svg
									width={14}
									height={14}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
									<path d="M12 7v6" />
									<path d="M9 10h6" />
								</svg>
							</button>
						</span>
					</div>
				</div>

				{activeSessionId ? (
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 8,
							padding: "6px var(--sp-3)",
							borderTop: "1px solid var(--border-soft)",
							background: "var(--surface-warm)",
						}}
					>
						{editingSessionId === activeSessionId ? (
							<input
								ref={editingInputRef}
								type="text"
								autoFocus
								value={editingTitle}
								onChange={(event) => setEditingTitle(event.target.value)}
								onFocus={(event) => event.currentTarget.select()}
								onBlur={() => {
									if (editingSessionId) void commitEditTitle(editingSessionId);
								}}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										if (editingSessionId) void commitEditTitle(editingSessionId);
									} else if (event.key === "Escape") {
										event.preventDefault();
										cancelEditTitle();
									}
								}}
								style={{
									font: "500 12px/1.3 var(--font-body)",
									color: "var(--fg)",
									background: "var(--surface)",
									border: "1px solid var(--accent)",
									borderRadius: "var(--r-sm)",
									padding: "2px 6px",
									flex: 1,
									minWidth: 0,
								}}
							/>
						) : (
							<span
								style={{
									font: "500 12px/1.3 var(--font-body)",
									color: "var(--fg-2)",
									overflow: "hidden",
									textOverflow: "ellipsis",
									whiteSpace: "nowrap",
									flex: 1,
									cursor: "text",
								}}
								title={t("chat.clickToRename")}
								onClick={() => {
									const current = sessions.find((s) => s.id === activeSessionId);
									if (current) beginEditTitle(activeSessionId, current.title);
								}}
							>
								{sessions.find((s) => s.id === activeSessionId)?.title ??
									t("chat.untitledConversation")}
							</span>
						)}
						<button
							type="button"
							title={t("chat.renameConversation")}
							aria-label={t("chat.renameConversation")}
							disabled={editingSessionId === activeSessionId}
							onClick={() => {
								const current = sessions.find((s) => s.id === activeSessionId);
								if (current) beginEditTitle(activeSessionId, current.title);
							}}
							style={{
								background: "transparent",
								border: 0,
								color: "var(--meta)",
								cursor: "pointer",
								padding: 2,
							}}
						>
							<svg
								width={12}
								height={12}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M12 20h9" />
								<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
							</svg>
						</button>
						<button
							type="button"
							title={t("chat.deleteConversation")}
							aria-label={t("chat.deleteConversation")}
							onClick={() => {
								const current = sessions.find((s) => s.id === activeSessionId);
								if (!current) return;
								if (window.confirm(t("chat.confirmDeleteConversation", { title: current.title }))) {
									void handleDelete(activeSessionId);
								}
							}}
							style={{
								background: "transparent",
								border: 0,
								color: "var(--meta)",
								cursor: "pointer",
								padding: 2,
							}}
						>
							<svg
								width={12}
								height={12}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
								<path d="M10 11v6" />
								<path d="M14 11v6" />
								<path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
							</svg>
						</button>
					</div>
				) : null}
			</div>

			<div
				className={styles.panelBody + " " + styles.chatTranscript}
				ref={scrollRef}
				onScroll={(event) => {
					const el = event.currentTarget;
					followLatestRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
				}}
			>
				{!canChat && messages.length === 0 ? (
					<ChatWelcome onOpenProviderSettings={openProviderSettings} />
				) : messages.length === 0 ? (
					<p
						style={{
							font: "400 12px var(--font-body)",
							color: "var(--muted)",
							padding: "24px var(--sp-4)",
							textAlign: "center",
							lineHeight: 1.5,
						}}
					>
						{t("chat.emptyState")}
					</p>
				) : (
					<>
						{messages.map((message, i) => (
							<ChatMessage
								key={message.id ?? i}
								message={message}
								busy={busy}
								actionsOpen={rewindFor?.messageId === message.id}
								onRewind={openRewind}
							/>
						))}
						{busy ? (
							<ChatMessage
								streaming
								message={{ role: "assistant", content: streamText, thinking: thinkingText }}
							/>
						) : null}
					</>
				)}
			</div>

			{contextBudgetOpen && llmConfig ? (
				<ContextBudgetDialog
					value={budget.budgetTokens}
					onClose={() => setContextBudgetOpen(false)}
					onSave={async (tokens) => {
						const snapshot = await nativeBridgeClient.aiEdition.llmGetSnapshot();
						if (!snapshot.config) throw new Error(t("chat.composerDisabledNoProvider"));
						const config = { ...snapshot.config, contextBudgetTokens: tokens };
						const result = await nativeBridgeClient.aiEdition.llmSetConfig(config);
						if (!result.success)
							throw new Error(result.error ?? t("chat.contextReferenceSaveFailed"));
						setLlmConfig(config);
					}}
				/>
			) : null}
			<div className={styles.chatInput}>
				<textarea
					placeholder={
						canChat ? t("chat.composerPlaceholder") : t("chat.composerDisabledNoProvider")
					}
					value={input}
					disabled={!canChat}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void send();
						}
					}}
				/>
				<div className={styles.actions}>
					<button
						ref={modelButtonRef}
						type="button"
						className={styles.modelPicker}
						aria-label={t("chat.modelLabel")}
						aria-haspopup="menu"
						aria-expanded={modelPopoverOpen}
						onClick={toggleModelPopoverOpen}
					>
						<svg
							width={12}
							height={12}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
						<span>{modelLabel}</span>
					</button>
					{reasoningLabel ? (
						<button
							ref={reasoningButtonRef}
							type="button"
							className={styles.reasoningBtn}
							aria-label={t("chat.reasoningEffortLabel")}
							aria-haspopup="menu"
							aria-expanded={reasoningOpen}
							onClick={toggleReasoningOpen}
						>
							<span className={styles.chip}>
								<span className={styles.d} />
								{reasoningLabel}
							</span>
						</button>
					) : null}
					{reasoningOpen && reasoningMenuRect
						? createPortal(
								<div
									role="menu"
									style={{
										position: "fixed",
										left: reasoningMenuRect.left,
										bottom: reasoningMenuRect.bottom,
										minWidth: 160,
										background: "var(--surface)",
										border: "1px solid var(--border)",
										borderRadius: "var(--r-md)",
										boxShadow: "var(--elev-pop)",
										padding: 4,
										zIndex: 1000,
									}}
								>
									{getReasoningEffortOptions(llmConfig?.provider ?? "").map((option) => (
										<button
											type="button"
											key={option}
											role="menuitem"
											disabled={reasoningBusy}
											onClick={() => void selectReasoningEffort(option)}
											style={{
												display: "flex",
												alignItems: "center",
												justifyContent: "space-between",
												gap: 8,
												width: "100%",
												padding: "6px 10px",
												border: "none",
												background:
													option === currentReasoningEffort ? "var(--surface-3)" : "transparent",
												color: "var(--fg)",
												borderRadius: "var(--r-sm)",
												cursor: "pointer",
												fontSize: 12.5,
											}}
										>
											{getReasoningEffortLabel(llmConfig?.provider ?? "", option)}
											{option === currentReasoningEffort ? <Check size={12} /> : null}
										</button>
									))}
								</div>,
								document.body,
							)
						: null}
					{modelPopoverOpen && modelPopoverRect && llmConfig ? (
						<ModelQuickPopover
							anchorRect={modelPopoverRect}
							llmConfig={llmConfig}
							connectedProviders={connectedProviders ?? []}
							onClose={() => setModelPopoverOpen(false)}
							onConfigChange={() => void refreshLlm()}
							onOpenFullSettings={openProviderSettings}
						/>
					) : null}
					<button
						type="button"
						className={styles.sendBtn}
						title={canChat ? t("chat.sendTitle") : t("chat.composerDisabledNoProvider")}
						aria-label={t("chat.send")}
						onClick={() => void send()}
						disabled={busy || !input.trim() || !canChat}
					>
						<svg
							width={14}
							height={14}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M3.714 3.048a.498.498 0 0 0-.683.627l2.843 7.627a2 2 0 0 1 0 1.396l-2.843 7.627a.498.498 0 0 0 .683.627l18-8.5a.5.5 0 0 0 0-.904Z" />
							<path d="M6 12h16" />
						</svg>
					</button>
				</div>
			</div>
			<ChatHistoryModal
				open={chatsOpen}
				onClose={() => setChatsOpen(false)}
				sessions={sessions}
				activeSessionId={activeSessionId}
				onSelect={selectSession}
				onNew={newChat}
			/>
			{rewindFor && rewindFor.anchor
				? createPortal(
						<div
							data-rewind-confirmation="true"
							role="dialog"
							aria-label={t("chat.rewindConfirmTitle")}
							style={{
								position: "fixed",
								left: rewindFor.anchor.left - 130,
								bottom: rewindFor.anchor.bottom,
								width: 260,
								background: "var(--surface)",
								border: "1px solid var(--border)",
								borderRadius: "var(--r-md)",
								boxShadow: "var(--elev-pop)",
								padding: 12,
								zIndex: 1000,
							}}
						>
							<strong style={{ display: "block", marginBottom: 4 }}>
								{t("chat.rewindConfirmTitle")}
							</strong>
							<p
								style={{
									font: "400 12px/1.4 var(--font-body)",
									color: "var(--muted)",
									margin: "0 0 8px",
								}}
							>
								{t("chat.rewindConfirmBody")}
							</p>
							<div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
								<button
									type="button"
									onClick={() => setRewindFor(null)}
									style={{
										padding: "4px 10px",
										background: "transparent",
										border: "1px solid var(--border-soft)",
										borderRadius: "var(--r-sm)",
										color: "var(--fg-2)",
										font: "500 12px var(--font-body)",
										cursor: "pointer",
									}}
								>
									{tc("actions.cancel")}
								</button>
								<button
									type="button"
									onClick={() => void confirmRewind(rewindFor.messageId)}
									style={{
										padding: "4px 10px",
										background: "var(--accent)",
										border: "1px solid var(--accent)",
										borderRadius: "var(--r-sm)",
										color: "var(--accent-on)",
										font: "500 12px var(--font-body)",
										cursor: "pointer",
									}}
								>
									{t("chat.rewindConfirm")}
								</button>
							</div>
						</div>,
						document.body,
					)
				: null}
		</aside>
	);
}

const RAIL_BUTTONS: Array<{ id: LeftTab; labelKey: string; icon: React.ElementType }> = [
	{ id: "chat", labelKey: "leftRail.chat", icon: MessageSquare },
	{ id: "media", labelKey: "leftRail.media", icon: Film },
];

export function LeftRail({
	active,
	onChange,
}: {
	active: LeftTab;
	onChange: (id: LeftTab) => void;
}) {
	const t = useScopedT("editor");
	return (
		<aside className={`${styles.rail} ${styles.leftRail}`} aria-label={t("leftRail.ariaLabel")}>
			{RAIL_BUTTONS.map(({ id, labelKey, icon: Icon }) => (
				<button
					type="button"
					key={id}
					title={t(labelKey)}
					aria-label={t(labelKey)}
					aria-pressed={active === id}
					onClick={() => onChange(id)}
				>
					<Icon size={18} />
				</button>
			))}
		</aside>
	);
}
