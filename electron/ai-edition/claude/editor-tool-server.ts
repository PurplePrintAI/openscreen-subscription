import { randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
	CallToolRequestSchema,
	type CallToolResult,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export interface EditorRuntimeTool {
	name: string;
	description: string;
	inputSchema: Record<string, unknown>;
	invoke: (args: Record<string, unknown>) => Promise<string>;
}

/** One short-lived loopback MCP endpoint per turn; only existing validated editor tools. */
export async function startEditorToolServer(tools: EditorRuntimeTool[]) {
	const token = randomBytes(32).toString("hex");
	const authorization = Buffer.from(`Bearer ${token}`);
	const registry = new Map(tools.map((tool) => [tool.name, tool]));
	const calls = new Map<string, { input: string; result: Promise<CallToolResult> }>();
	let tail: Promise<unknown> = Promise.resolve();
	let closed = false;
	let host = "";
	const sessions = new Set<Server>();
	const invoke = (
		id: string | number,
		name: string,
		args: Record<string, unknown>,
	): Promise<CallToolResult> => {
		const key = `${typeof id}:${id}`;
		const input = JSON.stringify({ name, args });
		const previous = calls.get(key);
		if (previous) {
			if (previous.input !== input)
				return Promise.resolve({
					isError: true,
					content: [{ type: "text", text: "Duplicate tool request ID." }],
				});
			return previous.result;
		}
		if (calls.size >= 64)
			return Promise.resolve({
				isError: true,
				content: [{ type: "text", text: "Editor tool call limit reached." }],
			});
		const result: Promise<CallToolResult> = tail.then(async () => {
			const tool = registry.get(name);
			if (closed || !tool)
				return {
					isError: true,
					content: [{ type: "text", text: "Tool unavailable or turn closed." }],
				};
			try {
				return { content: [{ type: "text", text: await tool.invoke(args) }] };
			} catch {
				return {
					isError: true,
					content: [
						{ type: "text", text: "Editor tool rejected the request. Check the tool arguments." },
					],
				};
			}
		});
		calls.set(key, { input, result });
		tail = result;
		return result;
	};
	const http = createServer(async (request, response) => {
		const actual = Buffer.from(request.headers.authorization ?? "");
		if (
			closed ||
			actual.length !== authorization.length ||
			!timingSafeEqual(actual, authorization)
		) {
			response.writeHead(401).end();
			return;
		}
		if (request.headers.host !== host || request.headers.origin) {
			response.writeHead(403).end();
			return;
		}
		if (request.url !== "/mcp") {
			response.writeHead(404).end();
			return;
		}
		if (request.method !== "POST") {
			response.writeHead(405).end();
			return;
		}
		let server: Server | undefined;
		try {
			const chunks: Buffer[] = [];
			let bytes = 0;
			for await (const chunk of request) {
				const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
				bytes += data.length;
				if (bytes > 256 * 1024) {
					response.writeHead(413).end();
					return;
				}
				chunks.push(data);
			}
			const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
			server = new Server(
				{ name: "openscreen-editor", version: "1.0.0" },
				{ capabilities: { tools: {} } },
			);
			server.setRequestHandler(ListToolsRequestSchema, async () => ({
				tools: tools.map((tool) => ({
					name: tool.name,
					description: tool.description,
					inputSchema: { ...tool.inputSchema, type: "object" as const },
				})),
			}));
			server.setRequestHandler(CallToolRequestSchema, async (call, extra) =>
				invoke(extra.requestId, call.params.name, call.params.arguments ?? {}),
			);
			const transport = new StreamableHTTPServerTransport({
				sessionIdGenerator: undefined,
				enableJsonResponse: true,
			});
			sessions.add(server);
			const active = server;
			response.on("close", () => {
				sessions.delete(active);
				void active.close();
			});
			await server.connect(transport);
			await transport.handleRequest(request, response, body);
		} catch {
			if (!response.headersSent) response.writeHead(400).end();
			else response.end();
			await server?.close();
		}
	});
	http.requestTimeout = 15_000;
	http.headersTimeout = 10_000;
	await new Promise<void>((resolve, reject) => {
		http.once("error", reject);
		http.listen(0, "127.0.0.1", resolve);
	});
	const address = http.address();
	if (!address || typeof address === "string")
		throw new Error("Could not start the editor tool endpoint.");
	host = `127.0.0.1:${address.port}`;
	return {
		config: {
			type: "http" as const,
			url: `http://${host}/mcp`,
			headers: { Authorization: `Bearer ${token}` },
		},
		async close() {
			closed = true;
			await tail;
			await Promise.allSettled([...sessions].map((server) => server.close()));
			http.closeAllConnections();
			await new Promise<void>((resolve) => http.close(() => resolve()));
		},
	};
}
