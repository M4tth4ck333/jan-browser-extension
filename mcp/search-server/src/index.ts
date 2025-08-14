import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";
import type { RawData } from "ws";
import { v4 as uuid } from "uuid";

// Bridge: extension connects OUTBOUND to this local WS server
const BRIDGE_HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 17389);

const server = new McpServer({
  name: "search-mcp-server",
  version: "0.1.0",
});

const SearchInputShape = {
  query: z.string().min(1),
  numResults: z.number().int().min(1).max(10).optional().default(5),
};
const SearchInput = z.object(SearchInputShape);

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  snippetHtml?: string;
  html?: string;
};

// --- WebSocket bridge state ---
let extSocket: WebSocket | null = null;
const wss = new WebSocketServer({ host: BRIDGE_HOST, port: BRIDGE_PORT });
wss.on("connection", (ws: WebSocket) => {
  extSocket = ws;
  console.log("[Bridge] Extension connected");
  ws.on("close", () => {
    if (extSocket === ws) extSocket = null;
    console.warn("[Bridge] Extension disconnected");
  });
});

async function callExtension(tool: string, params: any): Promise<any> {
  if (!extSocket || extSocket.readyState !== WebSocket.OPEN) {
    throw new Error("Browser extension not connected to bridge");
  }
  const id = uuid();
  const payload = { kind: "call", id, tool, params };
  return new Promise((resolve, reject) => {
    const socket = extSocket as WebSocket; // non-null, OPEN
    try { console.log("[Bridge] -> sending", { id, tool }); } catch {}
    const onMessage = (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.kind === "result" && msg.id === id) {
          clearTimeout(timeout);
          socket.off("message", onMessage);
          try { console.log("[Bridge] <- received", { id, ok: !!msg.ok }); } catch {}
          return msg.ok ? resolve(msg.data) : reject(new Error(msg.error || "Bridge error"));
        }
      } catch (_) { /* ignore */ }
    };
    const timeout = setTimeout(() => {
      socket.off("message", onMessage);
      try { console.warn("[Bridge] timeout waiting for", { id, tool }); } catch {}
      reject(new Error(`Timeout waiting for ${tool}`));
    }, 20000);
    socket.on("message", onMessage);
    socket.send(JSON.stringify(payload));
  });
}

server.registerTool(
  "search",
  {
    title: "Web Search (Google)",
    description:
      "Search the web via Google by asking the installed browser extension to perform the search and scrape the SERP.",
    inputSchema: SearchInputShape,
  },
  async (input: z.infer<typeof SearchInput>) => {
    const { query, numResults } = input;
    const n = numResults ?? 5;

    try {
      // Ask the extension to perform the search and scrape
      try { console.log("[Tool:search] forwarding to extension", { query, n }); } catch {}
      const data = await callExtension("search", { query, numResults: n });
      const results: SearchResult[] = Array.isArray(data?.results)
        ? data.results.map((r: any) => ({
            title: String(r.title || ""),
            url: String(r.url || ""),
            snippet: r.snippet ? String(r.snippet) : undefined,
            snippetHtml: r.snippetHtml ? String(r.snippetHtml) : undefined,
            html: r.html ? String(r.html) : undefined,
          }))
        : [];
      try { console.log("[Tool:search] results", { count: results.length }); } catch {}

      if (!results.length) {
        return { content: [{ type: "text", text: "No results." }] } as const;
      }

      const lines: string[] = [];
      const truncate = (s: string, limit = 4000) =>
        s.length <= limit ? s : s.slice(0, limit) + "\n...[truncated]";
      lines.push(`Top ${Math.min(results.length, n)} results for: "${query}"`);
      if (data?.pageTitle) {
        lines.push(`Page Title: ${String(data.pageTitle)}`);
      }
      if (data?.answerBox) {
        lines.push("");
        lines.push(`Answer Box:`);
        lines.push(String(data.answerBox));
        if (data?.answerBoxHtml) {
          lines.push("");
          lines.push(`Answer Box HTML:`);
          lines.push("```html");
          lines.push(truncate(String(data.answerBoxHtml), 4000));
          lines.push("```");
        }
      }
      lines.push("");
      results.slice(0, n).forEach((r, i) => {
        lines.push(`${i + 1}. ${r.title}`);
        lines.push(r.url);
        if (r.snippet) lines.push(`Snippet: ${r.snippet}`);
        if (r.snippetHtml) {
          lines.push("Snippet HTML:");
          lines.push("```html");
          lines.push(truncate(r.snippetHtml, 2000));
          lines.push("```");
        }
        if (r.html) {
          lines.push("Result HTML:");
          lines.push("```html");
          lines.push(truncate(r.html, 4000));
          lines.push("```");
        }
        lines.push("");
      });

      // Return a single text block; some MCP clients are strict about content types
      return { content: [{ type: "text" as const, text: lines.join("\n") }] } as const;
    } catch (err: any) {
      const msg = String(err?.message || err);
      return {
        content: [{ type: "text", text: `Search failed: ${msg}` }],
        isError: true,
      } as const;
    }
  }
);

async function main() {
  // Start stdio transport so tools can be used by MCP clients
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Run if invoked directly
main().catch((err) => {
  console.error("Search MCP server failed to start:", err);
  process.exit(1);
});
