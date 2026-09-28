// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatMessage } from "./ChatMessage";

vi.mock("@/contexts/I18nContext", () => ({
	useI18n: () => ({ locale: "en" }),
	useScopedT: () => (key: string) => key,
}));
afterEach(cleanup);

describe("chat message rendering", () => {
	it("keeps user text literal and renders assistant Markdown without visible speaker labels", () => {
		const { container } = render(
			<>
				<ChatMessage
					message={{
						role: "user",
						content: "**literal**\nsecond line",
						time: "2026-08-27T11:34:30.551Z",
					}}
				/>
				<ChatMessage
					message={{
						role: "assistant",
						content: "## Heading\n\n**Bold** and `code`\n\n- First\n- Second",
					}}
				/>
			</>,
		);
		expect(container.querySelector('[data-message-role="user"]')).toHaveTextContent("**literal**");
		expect(screen.getByRole("heading", { name: "Heading" })).toBeVisible();
		expect(screen.getByText("Bold").tagName).toBe("STRONG");
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
		expect(screen.queryByText("chat.authorUser")).not.toBeInTheDocument();
		expect(screen.queryByText("chat.authorAssistant")).not.toBeInTheDocument();
		expect(container.querySelector("time")).not.toHaveTextContent("2026-08-27T");
	});

	it("does not load remote images, execute HTML, or link to unsafe schemes", () => {
		const { container } = render(
			<ChatMessage
				message={{
					role: "assistant",
					content: [
						'<script>alert("bad")</script>',
						"![external](https://example.com/track.png)",
						"[bad](javascript:alert%281%29) [local](file:///C:/private.txt)",
						"[safe](https://example.com/docs)",
					].join("\n\n"),
				}}
			/>,
		);
		expect(container.querySelector("script, img, iframe")).toBeNull();
		expect(screen.getAllByRole("link")).toHaveLength(1);
		expect(screen.getByRole("link", { name: "safe" })).toHaveAttribute(
			"rel",
			"noopener noreferrer",
		);
	});

	it("previews only the explicit main-process generated image field", () => {
		render(
			<ChatMessage
				message={{
					role: "assistant",
					content: "Generated",
					generatedImagePath: "C:\\Studio\\generated-scenes\\proj_1\\source.png",
				}}
			/>,
		);
		expect(screen.getByRole("img", { name: "chat.generatedImagePreview" })).toHaveAttribute(
			"src",
			"file:///C:/Studio/generated-scenes/proj_1/source.png",
		);
	});

	it("reconciles partial Markdown while streaming and only exposes actions on completion", () => {
		const { container, rerender } = render(
			<ChatMessage streaming message={{ role: "assistant", content: "**Par" }} />,
		);
		expect(screen.getByRole("article")).toHaveAttribute("aria-busy", "true");
		expect(screen.queryByRole("button", { name: "chat.copyMessage" })).toBeNull();
		rerender(<ChatMessage message={{ role: "assistant", content: "**Partial complete**" }} />);
		expect(container.querySelectorAll("article")).toHaveLength(1);
		expect(screen.getByText("Partial complete").tagName).toBe("STRONG");
		expect(screen.getByRole("button", { name: "chat.copyMessage" })).toBeEnabled();
	});

	it("copies the source and rewinds with the canonical message ID; busy turns cannot rewind", async () => {
		const copy = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: copy },
		});
		const rewind = vi.fn();
		const message = {
			id: "server-user",
			role: "user" as const,
			checkpointId: "server-user",
			content: "original\ntext",
		};
		const { rerender } = render(<ChatMessage message={message} onRewind={rewind} />);
		fireEvent.click(screen.getByRole("button", { name: "chat.copyMessage" }));
		await waitFor(() => expect(copy).toHaveBeenCalledWith(message.content));
		fireEvent.click(screen.getByRole("button", { name: "chat.rewindToMessage" }));
		expect(rewind).toHaveBeenCalledWith("server-user", expect.any(HTMLButtonElement));
		rerender(<ChatMessage message={message} onRewind={rewind} busy />);
		expect(screen.getByRole("button", { name: "chat.rewindToMessage" })).toBeDisabled();
	});
});
