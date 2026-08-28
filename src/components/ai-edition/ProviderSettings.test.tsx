// @vitest-environment jsdom
// Issue #420: the AI provider dialog used to be a `useState` inside LeftPanel's chat strip, so
// it existed only in Edit mode with the chat panel expanded and nothing else could open it. It
// is mounted once now, above the mode switch, and driven by EditorDialogsContext.
//
// These tests are about *reach*, not about the dialog's own screens: that the app menu's row
// really opens it, that it opens in Media and Rec too, and that the row and the heading are one
// string rather than two that can drift apart.

import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorDialogsProvider, useEditorDialogActions } from "@/contexts/EditorDialogsContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { LOCALE_STORAGE_KEY } from "@/i18n/config";
import type { AiEditionLlmProviderModelsResult, AiEditionLlmSnapshot } from "@/native/contracts";
import { type EditorMode, EditorTopBar } from "./v4/EditorTopBar";

// The dialog reads a provider snapshot over the native bridge the moment it opens. Answer with
// an empty one: which providers exist is the registry's business, and this file's is the door.
const subscriptionLogin = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const subscriptionCancel = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const cliStatus = vi.hoisted(() => vi.fn(async () => ({ available: true, connected: false })));
const setConfig = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const listModels = vi.hoisted(() =>
	vi.fn(async (): Promise<AiEditionLlmProviderModelsResult> => ({ models: [] })),
);
const getSnapshot = vi.hoisted(() =>
	vi.fn(
		async (): Promise<AiEditionLlmSnapshot> => ({
			config: null,
			connectedProviders: [],
			availableProviders: [],
			credentialSummary: [],
		}),
	),
);
vi.mock("@/native/client", () => ({
	nativeBridgeClient: {
		aiEdition: {
			llmGetSnapshot: getSnapshot,
			llmListProviderModels: listModels,
			llmSubscriptionLogin: subscriptionLogin,
			llmSubscriptionCancelLogin: subscriptionCancel,
			llmSubscriptionStatus: cliStatus,
			llmSetConfig: setConfig,
		},
	},
}));

import { ProviderSettingsDialog } from "./ProviderSettings";

const noop = () => {};

/** The top bar as NewEditorShell builds it: the menu row's action is the context's opener, and
 *  nothing else in `actions` matters here. */
function TopBar({ mode }: { mode: EditorMode }) {
	const { openDialog } = useEditorDialogActions();
	return (
		<EditorTopBar
			mode={mode}
			onModeChange={noop}
			projectTitle="Demo Project"
			dirty={false}
			canExport={false}
			chatOpen={false}
			actions={{
				openProject: noop,
				newProject: noop,
				save: noop,
				export: noop,
				openSettings: noop,
				renameProject: noop,
				toggleChat: noop,
				openProviderSettings: () => openDialog("providers"),
				showAbout: noop,
				checkForUpdates: noop,
			}}
		/>
	);
}

/** The App.tsx shape, minus the editor body: one provider, one dialog mount, and the top bar
 *  that has to reach it. Rendered with the real translations — the drift assertion below is
 *  only worth anything against real strings. */
function renderEditorChrome(locale: string, mode: EditorMode = "edit") {
	localStorage.setItem(LOCALE_STORAGE_KEY, locale);
	return render(
		<I18nProvider>
			<EditorDialogsProvider>
				<TopBar mode={mode} />
				<ProviderSettingsDialog />
			</EditorDialogsProvider>
		</I18nProvider>,
	);
}

/** Open the app menu (the wordmark) and click its AI settings row. */
function openAiSettingsFromAppMenu() {
	fireEvent.click(screen.getByRole("button", { name: /OpenScreen/ }));
	fireEvent.click(screen.getByRole("menuitem", { name: /ai settings/i }));
}

beforeEach(() => {
	localStorage.clear();
	vi.clearAllMocks();
	listModels.mockReset().mockResolvedValue({ models: [] });
});

afterEach(() => {
	cleanup();
	localStorage.clear();
});

describe("ProviderSettings, reached from the app menu", () => {
	const catalog: AiEditionLlmProviderModelsResult = {
		models: ["sonnet", "opus[1m]", "claude-opus-4-8[1m]"],
		catalog: [
			{ id: "sonnet", label: "Sonnet 5", resolvedModel: "claude-sonnet-5" },
			{ id: "opus[1m]", label: "Opus 5 (1M context)" },
			{
				id: "claude-opus-4-8[1m]",
				label: "Opus 4.8 (1M context)",
				description: "Newer version available",
			},
		],
	};
	async function openClaude(model = "sonnet") {
		getSnapshot.mockResolvedValueOnce({
			config: {
				provider: "claude-local",
				model,
				contextBudgetTokens: 200_000,
				allowAgentEdits: false,
			},
			connectedProviders: ["claude-local"],
			availableProviders: [],
			credentialSummary: [],
		});
		renderEditorChrome("en");
		openAiSettingsFromAppMenu();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /Claude \(local\)/ })).toBeEnabled(),
		);
		fireEvent.click(screen.getByRole("button", { name: /Claude \(local\)/ }));
	}

	it("selects real catalog names and saves the exact native 1M selection value", async () => {
		listModels.mockResolvedValue(catalog);
		await openClaude();
		const model = await screen.findByRole("combobox", { name: "Model" });
		expect(screen.getByRole("option", { name: "Sonnet 5" })).toBeInTheDocument();
		expect(screen.getByRole("option", { name: "Opus 5 (1M context)" })).toBeInTheDocument();
		fireEvent.change(model, { target: { value: "claude-opus-4-8[1m]" } });
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
		await waitFor(() =>
			expect(setConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					model: "claude-opus-4-8[1m]",
					contextBudgetTokens: 200_000,
					allowAgentEdits: false,
				}),
			),
		);
	});

	it("retains custom model IDs when toggling and refreshing the catalog", async () => {
		listModels.mockResolvedValue(catalog);
		await openClaude("custom-model");
		expect(await screen.findByRole("combobox", { name: "Model" })).toHaveValue("custom-model");
		fireEvent.click(screen.getByRole("button", { name: "Enter model ID" }));
		fireEvent.change(screen.getByRole("textbox", { name: "Model" }), {
			target: { value: "claude-opus-5[1m]" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Choose from catalog" }));
		fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));
		await waitFor(() => expect(listModels).toHaveBeenCalledTimes(2));
		await waitFor(() => expect(screen.getByRole("combobox", { name: "Model" })).toBeEnabled());
		expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("claude-opus-5[1m]");
	});

	it("shows discovery errors and retries without silently replacing the saved model", async () => {
		listModels
			.mockResolvedValueOnce({ models: [], error: "CLI unavailable" })
			.mockResolvedValue(catalog);
		await openClaude("claude-opus-4-8[1m]");
		await screen.findByText(/CLI unavailable/);
		expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("claude-opus-4-8[1m]");
		fireEvent.click(screen.getByRole("button", { name: "Refresh models" }));
		expect(await screen.findByRole("combobox", { name: "Model" })).toHaveValue(
			"claude-opus-4-8[1m]",
		);
	});

	it("checks externally managed CLI auth without an app login or token field", async () => {
		renderEditorChrome("en");
		openAiSettingsFromAppMenu();
		// Do not allow an in-flight saved config to overwrite a newly selected provider.
		expect(screen.getByRole("button", { name: /Claude \(local\)/ })).toBeDisabled();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /Claude \(local\)/ })).toBeEnabled(),
		);
		fireEvent.click(screen.getByRole("button", { name: /Claude \(local\)/ }));
		expect(screen.getByText("claude auth login")).toBeInTheDocument();
		expect(screen.queryByText("API key", { selector: "label" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "Check CLI connection" }));
		await waitFor(() => expect(cliStatus).toHaveBeenCalledWith("claude-local"));
		expect(subscriptionLogin).not.toHaveBeenCalled();
	});

	it("shows subscription billing and preserves edit permission and context settings when selecting Claude", async () => {
		getSnapshot.mockResolvedValueOnce({
			config: {
				provider: "codex-subscription",
				model: "account-model",
				allowAgentEdits: false,
				contextBudgetTokens: 200_000,
			},
			connectedProviders: ["claude-local"],
			availableProviders: [],
			credentialSummary: [],
			subscriptions: {
				"claude-local": { available: true, connected: true, plan: "max", billing: "subscription" },
			},
		});
		renderEditorChrome("en");
		openAiSettingsFromAppMenu();
		await waitFor(() =>
			expect(
				screen.getByRole("button", { name: /Claude \(local\).*Connected/ }),
			).toBeInTheDocument(),
		);
		fireEvent.click(screen.getByRole("button", { name: /Claude \(local\)/ }));
		expect(screen.getByRole("status")).toHaveTextContent("Claude subscription: max");
		fireEvent.click(screen.getByRole("button", { name: /^Save$/ }));
		await waitFor(() =>
			expect(setConfig).toHaveBeenCalledWith(
				expect.objectContaining({
					provider: "claude-local",
					model: "sonnet",
					allowAgentEdits: false,
					contextBudgetTokens: 200_000,
				}),
			),
		);
	});
	it("offers ChatGPT sign-in without an API-key field or premature save", async () => {
		renderEditorChrome("en");
		openAiSettingsFromAppMenu();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: /ChatGPT subscription/ })).toBeEnabled(),
		);
		fireEvent.click(screen.getByRole("button", { name: /ChatGPT subscription/ }));
		expect(screen.queryByText("API key", { selector: "label" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "Sign in with ChatGPT" }));
		await waitFor(() => expect(subscriptionLogin).toHaveBeenCalledWith("codex-subscription"));
	});
	it("is absent until the menu row is clicked, then mounted as a dialog", () => {
		renderEditorChrome("en");
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

		openAiSettingsFromAppMenu();

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: /ai settings/i })).toBeInTheDocument();
	});

	it.each<EditorMode>([
		"media",
		"rec",
	])("opens in %s mode, where the chat panel that used to own it does not exist", (mode) => {
		// The reason the state was lifted. LeftPanel renders only under `mode === "edit" &&
		// chatOpen`, so before this change the row would have been dead in both of these.
		renderEditorChrome("en", mode);

		openAiSettingsFromAppMenu();

		expect(screen.getByRole("dialog")).toBeInTheDocument();
	});

	it("labels the menu row with the dialog's own heading, so the two cannot drift", () => {
		// Both read `editor.providerSettings.title`. A menu-only key would be free to say
		// something else after a copy edit, and the menu would start lying about where it goes.
		// Compared as text rather than asserted against a literal, so a copy edit moves both.
		renderEditorChrome("en");
		fireEvent.click(screen.getByRole("button", { name: /OpenScreen/ }));
		const rowLabel = screen.getByRole("menuitem", { name: /ai settings/i }).textContent;

		fireEvent.click(screen.getByRole("menuitem", { name: /ai settings/i }));

		expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent(rowLabel ?? "");
	});

	it("closes again from the dialog's own close button", () => {
		renderEditorChrome("en");
		openAiSettingsFromAppMenu();

		fireEvent.click(screen.getByRole("button", { name: /close/i }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("translates the row with the dialog, not separately", () => {
		renderEditorChrome("fr");
		fireEvent.click(screen.getByRole("button", { name: /OpenScreen/ }));
		const row = screen.getByRole("menuitem", { name: /paramètres ia/i });

		fireEvent.click(row);

		expect(screen.getByRole("heading", { name: /paramètres ia/i })).toBeInTheDocument();
	});
});
