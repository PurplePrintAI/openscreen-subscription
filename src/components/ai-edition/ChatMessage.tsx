import { Copy, Loader2, RotateCcw } from "lucide-react";
import { memo } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
import type { AiEditionToolCallSummary } from "@/native/contracts";
import styles from "./NewEditorShell.module.css";

export interface ChatDisplayMessage {
	id?: string;
	role: "user" | "assistant";
	content: string;
	time?: string;
	toolCalls?: AiEditionToolCallSummary[];
	checkpointId?: string | null;
	thinking?: string;
	interrupted?: boolean;
}

// Model output is untrusted: no raw HTML, remote images, local-file links or custom protocols.
const markdownComponents: Components = {
	a: ({ href, children }) =>
		href ? (
			<a href={href} target="_blank" rel="noopener noreferrer">
				{children}
			</a>
		) : (
			<span>{children}</span>
		),
	img: ({ alt }) => <span>{alt}</span>,
	table: ({ children }) => (
		<div className={styles.messageTable}>
			<table>{children}</table>
		</div>
	),
};

function safeMessageUrl(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
	} catch {
		return undefined;
	}
}

export const ChatMessage = memo(function ChatMessage({
	message,
	streaming = false,
	busy = false,
	actionsOpen = false,
	onRewind,
}: {
	message: ChatDisplayMessage;
	streaming?: boolean;
	busy?: boolean;
	actionsOpen?: boolean;
	onRewind?: (messageId: string, button: HTMLButtonElement) => void;
}) {
	const t = useScopedT("editor");
	const { locale } = useI18n();
	const user = message.role === "user";
	const date = message.time ? new Date(message.time) : null;
	const validDate = date && Number.isFinite(date.getTime());
	const time = validDate
		? date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })
		: message.time;
	return (
		<article
			className={`${styles.msg} ${user ? styles.msgUser : styles.msgAssistant}`}
			aria-label={user ? t("chat.authorUser") : t("chat.authorAssistant")}
			aria-busy={streaming || undefined}
			data-message-role={message.role}
			data-actions-open={actionsOpen || undefined}
		>
			{message.thinking ? (
				<details className={styles.messageThinking}>
					<summary>{t("chat.thinking")}</summary>
					<div>{message.thinking}</div>
				</details>
			) : null}
			{message.content ? (
				<div className={user ? styles.msgBubble : styles.assistantContent}>
					{user ? (
						message.content
					) : (
						<Markdown
							skipHtml
							remarkPlugins={[remarkGfm]}
							components={markdownComponents}
							urlTransform={safeMessageUrl}
						>
							{message.content}
						</Markdown>
					)}
				</div>
			) : null}
			{message.toolCalls?.length ? (
				<ul className={styles.messageTools}>
					{message.toolCalls.map((call, i) => (
						<li key={`${call.name}-${i}`}>
							{t("chat.appliedPrefix")} {call.summary}
						</li>
					))}
				</ul>
			) : null}
			{streaming ? (
				<div className={styles.messageStatus} role="status">
					<Loader2 size={13} className={styles.messageSpinner} aria-hidden />
					{t("chat.responding")}
				</div>
			) : (
				<>
					{message.interrupted ? (
						<p className={styles.messageInterrupted} role="status">
							{t("chat.responseInterrupted")}
						</p>
					) : null}
					<div className={styles.msgMeta}>
						{time ? (
							<time
								dateTime={validDate ? message.time : undefined}
								title={validDate ? date.toLocaleString(locale) : time}
							>
								{time}
							</time>
						) : null}
						{user && message.id && message.checkpointId && onRewind ? (
							<button
								type="button"
								data-rewind-trigger="true"
								disabled={busy}
								title={t("chat.rewindToMessage")}
								aria-label={t("chat.rewindToMessage")}
								aria-expanded={actionsOpen}
								onClick={(event) => onRewind(message.id!, event.currentTarget)}
							>
								<RotateCcw size={14} aria-hidden />
							</button>
						) : null}
						<button
							type="button"
							title={t("chat.copyMessage")}
							aria-label={t("chat.copyMessage")}
							onClick={() =>
								void navigator.clipboard.writeText(message.content).then(
									() => toast.success(t("chat.copiedToClipboard")),
									() => toast.error(t("chat.copyFailed")),
								)
							}
						>
							<Copy size={14} aria-hidden />
						</button>
					</div>
				</>
			)}
		</article>
	);
});
