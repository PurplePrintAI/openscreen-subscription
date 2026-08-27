// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextBudgetDialog } from "./ContextBudgetDialog";

vi.mock("@/contexts/I18nContext", () => ({ useScopedT: () => (key: string) => key }));
afterEach(cleanup);

describe("context reference settings", () => {
	it("accepts a preset, awaits persistence, then closes", async () => {
		const save = vi.fn().mockResolvedValue(undefined);
		const close = vi.fn();
		render(<ContextBudgetDialog value={80_000} onSave={save} onClose={close} />);
		fireEvent.click(screen.getByRole("button", { name: "128,000" }));
		fireEvent.click(screen.getByRole("button", { name: "actions.save" }));
		await waitFor(() => expect(close).toHaveBeenCalledOnce());
		expect(save).toHaveBeenCalledWith(128_000);
	});

	it.each(["", "0", "999", "1000.5", "2000001"])("does not save invalid input %s", (value) => {
		const save = vi.fn();
		render(<ContextBudgetDialog value={80_000} onSave={save} onClose={vi.fn()} />);
		fireEvent.change(screen.getByRole("spinbutton"), { target: { value } });
		expect(screen.getByRole("button", { name: "actions.save" })).toBeDisabled();
		expect(screen.getByRole("alert")).toBeVisible();
		expect(save).not.toHaveBeenCalled();
	});

	it("keeps the draft open on failure and cancels without saving", async () => {
		const save = vi.fn().mockRejectedValue(new Error("Write failed"));
		const close = vi.fn();
		render(<ContextBudgetDialog value={128_000} onSave={save} onClose={close} />);
		fireEvent.click(screen.getByRole("button", { name: "chat.contextReferenceReset" }));
		expect(screen.getByRole("spinbutton")).toHaveValue(80_000);
		fireEvent.click(screen.getByRole("button", { name: "actions.save" }));
		await screen.findByText("Write failed");
		expect(close).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "actions.cancel" }));
		expect(save).toHaveBeenCalledOnce();
		expect(close).toHaveBeenCalledOnce();
	});
});
