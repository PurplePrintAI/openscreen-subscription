import { useState } from "react";
import { useScopedT } from "@/contexts/I18nContext";
import {
	DEFAULT_CONTEXT_BUDGET_TOKENS,
	isValidContextBudget,
	MAX_CONTEXT_BUDGET_TOKENS,
	MIN_CONTEXT_BUDGET_TOKENS,
} from "@/lib/ai-edition/contextBudget";
import { ModalShell } from "./Modals";
import styles from "./NewEditorShell.module.css";

/** Mounted on open so Cancel discards the draft, including an invalid/empty value. */
export function ContextBudgetDialog({
	value,
	onSave,
	onClose,
}: {
	value: number;
	onSave: (tokens: number) => Promise<void>;
	onClose: () => void;
}) {
	const t = useScopedT("editor");
	const tc = useScopedT("common");
	const [draft, setDraft] = useState(String(value));
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const valid = draft.trim().length > 0 && isValidContextBudget(Number(draft));
	const close = () => {
		if (!busy) onClose();
	};
	return (
		<ModalShell
			open
			onClose={close}
			title={t("chat.contextSettings")}
			subtitle={t("chat.contextReferenceHint")}
		>
			<form
				className={styles.contextForm}
				onSubmit={async (event) => {
					event.preventDefault();
					if (!valid || busy) return;
					setBusy(true);
					setError(null);
					try {
						await onSave(Number(draft));
						onClose();
					} catch (err) {
						setError(err instanceof Error ? err.message : String(err));
					} finally {
						setBusy(false);
					}
				}}
			>
				<label htmlFor="chat-context-budget">{t("chat.contextReferenceLabel")}</label>
				<input
					id="chat-context-budget"
					type="number"
					min={MIN_CONTEXT_BUDGET_TOKENS}
					max={MAX_CONTEXT_BUDGET_TOKENS}
					step={1}
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					disabled={busy}
					aria-invalid={!valid}
					aria-describedby="chat-context-help"
				/>
				<div className={styles.contextPresets}>
					{[80_000, 128_000, 200_000, 1_000_000].map((tokens) => (
						<button
							key={tokens}
							type="button"
							disabled={busy}
							aria-pressed={Number(draft) === tokens}
							onClick={() => setDraft(String(tokens))}
						>
							{tokens.toLocaleString()}
						</button>
					))}
				</div>
				<p id="chat-context-help">{t("chat.contextReferenceScope")}</p>
				{!valid ? <p role="alert">{t("chat.contextReferenceInvalid")}</p> : null}
				{error ? <p role="alert">{error}</p> : null}
				<footer className={styles.contextActions}>
					<button
						type="button"
						disabled={busy}
						onClick={() => setDraft(String(DEFAULT_CONTEXT_BUDGET_TOKENS))}
					>
						{t("chat.contextReferenceReset")}
					</button>
					<button type="button" disabled={busy} onClick={close}>
						{tc("actions.cancel")}
					</button>
					<button type="submit" disabled={!valid || busy}>
						{tc("actions.save")}
					</button>
				</footer>
			</form>
		</ModalShell>
	);
}
