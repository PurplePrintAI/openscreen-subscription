import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { describe, expect, it, vi } from "vitest";
import { startEditorToolServer } from "./editor-tool-server";

describe("Claude editor MCP endpoint", () => {
	it("serves only registered tools, rejects foreign access, and closes its port", async () => {
		const invoke = vi.fn(async () => "editor-result");
		const server = await startEditorToolServer([
			{
				name: "getCurrentDocument",
				description: "Read this project",
				inputSchema: { type: "object", properties: {} },
				invoke,
			},
		]);
		const client = new Client({ name: "test", version: "1" });
		try {
			expect((await fetch(server.config.url)).status).toBe(401);
			expect(
				(
					await fetch(server.config.url, {
						headers: { ...server.config.headers, Origin: "https://untrusted.example" },
					})
				).status,
			).toBe(403);
			const hostileHostStatus = await new Promise<number | undefined>((resolve, reject) => {
				const outgoing = request(
					server.config.url,
					{ headers: { ...server.config.headers, Host: "untrusted.example" } },
					(response) => {
						response.resume();
						resolve(response.statusCode);
					},
				);
				outgoing.on("error", reject);
				outgoing.end();
			});
			expect(hostileHostStatus).toBe(403);
			await client.connect(
				new StreamableHTTPClientTransport(new URL(server.config.url), {
					requestInit: { headers: server.config.headers },
				}),
			);
			expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual([
				"getCurrentDocument",
			]);
			expect(await client.callTool({ name: "getCurrentDocument", arguments: {} })).toMatchObject({
				content: [{ type: "text", text: "editor-result" }],
			});
			expect(
				await client.callTool({ name: "Bash", arguments: { command: "not allowed" } }),
			).toMatchObject({ isError: true });
			expect(invoke).toHaveBeenCalledTimes(1);
		} finally {
			await client.close();
			await server.close();
		}
		await expect(fetch(server.config.url)).rejects.toThrow();
	});

	it("does not replay a mutation on a duplicate JSON-RPC request", async () => {
		const invoke = vi.fn(async () => "changed");
		const server = await startEditorToolServer([
			{ name: "addTrim", description: "Trim", inputSchema: { type: "object" }, invoke },
		]);
		const call = (name: string) =>
			fetch(server.config.url, {
				method: "POST",
				headers: {
					...server.config.headers,
					"Content-Type": "application/json",
					Accept: "application/json, text/event-stream",
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 7,
					method: "tools/call",
					params: { name, arguments: {} },
				}),
			}).then((response) => response.json());
		try {
			const [first, second] = await Promise.all([call("addTrim"), call("addTrim")]);
			expect(first).toEqual(second);
			expect(invoke).toHaveBeenCalledTimes(1);
			expect(await call("different")).toMatchObject({ result: { isError: true } });
		} finally {
			await server.close();
		}
	});
});

import { request } from "node:http";
