import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { WebSocketServer, WebSocket } from "ws";
import { appendFileSync } from "node:fs";
import type { RawData } from "ws";
import { v4 as uuid } from "uuid";

// Bridge: extension connects OUTBOUND to this local WS server
const BRIDGE_HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const BRIDGE_PORT = Number(process.env.BRIDGE_PORT || 17389);
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || undefined; // optional shared secret
const SERVER_VERSION = "0.1.1-visit-shape";

// Optional file logging if MCP_LOG_FILE is set
const LOG_FILE = process.env.MCP_LOG_FILE;
if (LOG_FILE) {
  try {
    appendFileSync(
      LOG_FILE,
      `[${new Date().toISOString()}] search-mcp-server v${SERVER_VERSION} starting; bridge ws://${BRIDGE_HOST}:${BRIDGE_PORT}\n`
    );
  } catch (e) {
    console.error("[Startup] failed to write log file", e);
  }
}

// Basic SSRF guard: allow only http/https and block obvious localhost/private IPs
function isSafePublicUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const h = (u.hostname || '').toLowerCase();
    if (!h) return false;
    if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return false;
    // Block common private IPv4 ranges
    if (/^(10|127)\./.test(h)) return false;
    if (/^169\.254\./.test(h)) return false;
    if (/^192\.168\./.test(h)) return false;
    const m = h.match(/^172\.(\d{1,3})\./);
    if (m) {
      const oct = Number(m[1]);
      if (oct >= 16 && oct <= 31) return false;
    }
    return true;
  } catch {
    return false;
  }
}

const server = new McpServer({
  name: "search-mcp-server",
  version: SERVER_VERSION,
});

const SearchInputShape = {
  query: z.string().min(1),
  numResults: z.number().int().min(1).max(10).optional(),
  // Optional output format: 'serper' (default) returns JSON similar to Serper.dev; 'text' returns a human summary
  format: z.enum(["serper", "text"]).optional(),
};
const SearchInput = z.object(SearchInputShape);

const VisitInputShape = {
  url: z.string().url(),
  // Preferred content representation from the extension
  // 'markdown' | 'html' | 'text'
  mode: z.enum(["markdown", "html", "text"]).optional(),
};
const VisitInput = z.object(VisitInputShape);

type SearchResult = {
  title: string;
  url: string;
  snippet?: string;
  snippetHtml?: string;
  html?: string;
};

// --- WebSocket bridge state ---
let extSocket: WebSocket | null = null;
const wss = new WebSocketServer({
  host: BRIDGE_HOST,
  port: BRIDGE_PORT,
  maxPayload: 1 << 20,
  perMessageDeflate: false,
});
wss.on("connection", (ws: WebSocket, req) => {
  try {
    // Enforce optional token via ?t= query parameter
    if (BRIDGE_TOKEN) {
      const u = new URL(req.url || "/", `ws://${BRIDGE_HOST}:${BRIDGE_PORT}`);
      const t = u.searchParams.get("t") || undefined;
      if (t !== BRIDGE_TOKEN) {
        try { console.warn("[Bridge] rejected connection with invalid token"); } catch {}
        try { ws.close(1008, "Invalid token"); } catch {}
        return;
      }
    }
  } catch (_) {
    try { ws.close(1011, "Handshake error"); } catch {}
    return;
  }
  extSocket = ws;
  console.error("[Bridge] Extension connected");
  ws.on("close", () => {
    if (extSocket === ws) extSocket = null;
    console.warn("[Bridge] Extension disconnected");
  });
});

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

async function waitForBridgeConnection(timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (extSocket && extSocket.readyState === WebSocket.OPEN) return true;
    await sleep(100);
  }
  return false;
}

async function callExtension(tool: string, params: any): Promise<any> {
  if (!extSocket || extSocket.readyState !== WebSocket.OPEN) {
    throw new Error("Browser extension not connected to bridge");
  }
  const id = uuid();
  const payload = { kind: "call", id, tool, params };
  return new Promise((resolve, reject) => {
    const socket = extSocket as WebSocket; // non-null, OPEN
    try { console.error("[Bridge] -> sending", { id, tool }); } catch {}
    const onMessage = (raw: RawData) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.kind === "result" && msg.id === id) {
          clearTimeout(timeout);
          socket.off("message", onMessage);
          try { console.error("[Bridge] <- received", { id, ok: !!msg.ok }); } catch {}
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

// Tiny helper tool to introspect bridge status
server.registerTool(
  "bridge_status",
  {
    title: "Bridge Status",
    description: "Returns whether the browser extension is connected to the bridge",
    inputSchema: {},
  },
  async () => {
    const connected = !!(extSocket && extSocket.readyState === WebSocket.OPEN);
    try { console.error("[Tool:bridge_status]", { connected }); } catch {}
    return { content: [{ type: "text", text: `connected: ${connected}` }] };
  }
);

// Server info tool to verify binary version at runtime
server.registerTool(
  "server_info",
  {
    title: "Server Info",
    description: "Returns the server name and version to verify runtime binary",
    inputSchema: {},
  },
  async () => {
    const info = { name: "search-mcp-server", version: SERVER_VERSION, ts: new Date().toISOString() };
    return { content: [{ type: "text", text: JSON.stringify(info) }] } as any;
  }
);

// Visit a URL via the extension and extract content (markdown/html/text)
server.registerTool(
  "visit_tool",
  {
    title: "Visit URL (Deep Dive)",
    description:
      "Visit a URL via the installed browser extension and extract page content (innerHTML/markdown). Use this to visit the URLs returned by search for a deeper dive.",
    inputSchema: VisitInputShape,
  },
  async (args: any) => {
    const parsed = VisitInput.parse(args);
    const { url, mode } = parsed;

    let html: string | undefined;
    let markdown: string | undefined;
    let text: string | undefined;
    let title: string | undefined;

    // Try via extension first
    try {
      if (!(extSocket && extSocket.readyState === WebSocket.OPEN)) {
        try { console.error("[Tool:visit_tool] waiting for bridge connection..."); } catch {}
        await waitForBridgeConnection(4000);
      }
      try { console.error("[Tool:visit_tool] forwarding to extension", { url, mode: mode ?? "markdown" }); } catch {}
      const data = await callExtension("visit", { url, mode: mode ?? "markdown" });
      html = typeof data?.html === "string" ? data.html : undefined;
      markdown = typeof data?.markdown === "string" ? data.markdown : undefined;
      text = typeof data?.text === "string" ? data.text : undefined;
      title = typeof data?.title === "string" ? data.title : undefined;
    } catch (e) {
      try { console.error("[Tool:visit_tool] extension path failed; falling back to fetch", String(e)); } catch {}
    }

    // Fallback: direct fetch (Node 18+/Bun global fetch)
    if (!html && !markdown && !text) {
      if (!isSafePublicUrl(url)) {
        const msg = `Refused to fetch ${url}: not a safe public URL`;
        return { content: [{ type: "text", text: msg }], _meta: { urls: [url] } } as any;
      }
      try {
        const resp = await (globalThis as any).fetch(url);
        const raw = await resp.text();
        html = raw;
        const m = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
        title = m ? stripTags(m[1]) : undefined;
        markdown = stripTags(raw);
        text = markdown;
      } catch (e) {
        const msg = `Failed to fetch ${url}: ${String(e)}`;
        return { content: [{ type: "text", text: msg }], _meta: { urls: [url] } } as any;
      }
    }

    // Build a compact payload with only the most relevant data
    const chosen: "markdown" | "text" | "html" = ((): any => {
      if (mode === "markdown" || mode === "text" || mode === "html") return mode;
      if (markdown) return "markdown";
      if (text) return "text";
      return "html";
    })();

    const payload: any = { url, success: true };
    if (title) payload.title = title;
    let content: string | undefined;
    if (chosen === "markdown" && markdown) content = markdown.trim();
    else if (chosen === "text" && text) content = text.trim();
    else if (chosen === "html" && html) content = html.trim();
    payload.contentType = chosen;
    payload.content = content ?? "";

    const jsonText = JSON.stringify(payload, null, 2);
    try { console.error("[Tool:visit_tool] returning", { kind: `json:${chosen}`, length: jsonText.length }); } catch {}
    return { content: [{ type: "text", text: jsonText }], _meta: { urls: [url] } } as any;
  }
);

function stripTags(html?: string): string {
  if (!html) return "";
  try {
    let s = html;
    // Remove script/style blocks entirely before stripping tags
    s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");
    s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "");
    s = s.replace(/<[^>]*>/g, " ");
    return s.replace(/\s+/g, " ").trim();
  } catch {
    return html;
  }
}

server.registerTool(
  "search",
  {
    title: "Web Search (Google)",
    description:
      "Search the web via Google by asking the installed browser extension to perform the search and scrape the SERP.",
    inputSchema: SearchInputShape,
  },
  async (args: any, _extra: any) => {
    const parsed = SearchInput.parse(args);
    const { query, numResults, format } = parsed;
    const n = numResults ?? 5;
    const preferSerper = (format ?? "serper") === "serper";

    try {
      // Ask the extension to perform the search and scrape
      // If extension not connected yet, wait briefly for it to reconnect
      if (!(extSocket && extSocket.readyState === WebSocket.OPEN)) {
        try { console.error("[Tool:search] waiting for bridge connection..."); } catch {}
        await waitForBridgeConnection(4000);
      }
      try { console.error("[Tool:search] forwarding to extension", { query, n }); } catch {}
      const data = await callExtension("search", { query, numResults: n });
      const results: SearchResult[] = Array.isArray(data?.results)
        ? (data.results as any[]).map((r) => ({
            title: String(r?.title ?? ""),
            url: String(r?.url ?? r?.link ?? ""),
            html: String(r?.html ?? r?.snippetHtml ?? r?.htmlSnippet ?? ""),
          }))
        : [];
      try { console.error("[Tool:search] results", { count: results.length }); } catch {}

      if (!results.length) {
        const emptyJson = preferSerper ? JSON.stringify({ knowledgeGraph: undefined, organic: [], peopleAlsoAsk: [] }, null, 2) : "No results.";
        return { content: [{ type: "text", text: emptyJson }], _meta: { urls: [] } } as any;
      }

      const urls = results.slice(0, n).map(r => r.url).filter(Boolean);

      if (preferSerper) {
        const ab: any = data?.answerBox && typeof data.answerBox === "object" ? data.answerBox : undefined;
        let knowledgeGraph: any = undefined;
        if (ab) {
          const imageUrl = typeof ab.imageUrl === "string" && /^https?:/i.test(ab.imageUrl) ? ab.imageUrl : undefined; // drop base64 icons
          const attrs = ab.attributes && typeof ab.attributes === "object" ? ab.attributes : undefined;
          knowledgeGraph = {
            title: ab.title ?? ab.name ?? undefined,
            type: ab.type ?? undefined,
            website: ab.website ?? ab.site ?? undefined,
            imageUrl,
            description: ab.description ?? ab.text ?? undefined,
            descriptionSource: ab.descriptionSource ?? undefined,
            descriptionLink: ab.descriptionLink ?? undefined,
            attributes: attrs,
          } as any;
          Object.keys(knowledgeGraph).forEach((k) => {
            if ((knowledgeGraph as any)[k] === undefined) delete (knowledgeGraph as any)[k];
          });
          if (Object.keys(knowledgeGraph).length === 0) knowledgeGraph = undefined;
        }

        const organic = results.slice(0, n).map((r, i) => {
          const snippet = stripTags(r.html);
          const item: any = { title: r.title || r.url, link: r.url, position: i + 1 };
          if (snippet) item.snippet = snippet;
          return item;
        });

        const peopleAlsoAsk = Array.isArray(data?.peopleAlsoAsk)
          ? (data.peopleAlsoAsk as any[]).map((q) => ({
              question: q?.question ?? q?.q ?? undefined,
              snippet: q?.snippet ?? q?.a ?? undefined,
              title: q?.title ?? undefined,
              link: q?.link ?? q?.url ?? undefined,
            })).filter((x) => x.question || x.snippet || x.title || x.link)
          : [];

        const serperLike: any = {};
        if (knowledgeGraph) serperLike.knowledgeGraph = knowledgeGraph;
        serperLike.organic = organic;
        if (peopleAlsoAsk.length) serperLike.peopleAlsoAsk = peopleAlsoAsk;
        // Also include plain list of URLs to make consumption easier without parsing _meta
        serperLike.urls = urls;

        const jsonText = JSON.stringify(serperLike, null, 2);
        try { console.error("[Tool:search] returning", { kind: "serper-json", length: jsonText.length, urls: urls.length }); } catch {}
        return { content: [{ type: "text", text: jsonText }], _meta: { urls } } as any;
      } else {
        const lines: string[] = [];
        lines.push(`Top ${Math.min(results.length, n)} results for: "${query}"`);
        const pageTitle = typeof data?.pageTitle === "string" ? data.pageTitle : undefined;
        if (pageTitle) lines.push(`Page Title: ${pageTitle}`);
        lines.push("");
        const answerBox = data?.answerBox;
        if (answerBox && typeof answerBox === "object") {
          const ansTitle = typeof (answerBox as any).title === "string" ? (answerBox as any).title : undefined;
          const ansText = typeof (answerBox as any).text === "string" ? (answerBox as any).text : undefined;
          if (ansTitle || ansText) {
            lines.push("Answer Box:");
            if (ansTitle) lines.push(ansTitle);
            if (ansText) lines.push(ansText);
            lines.push("");
          }
        }
        results.slice(0, n).forEach((r, idx) => {
          const num = idx + 1;
          lines.push(`${num}. ${r.title || r.url}`);
          if (r.url) lines.push(r.url);
          if (r.html) {
            lines.push("Result HTML:");
            lines.push("```html");
            lines.push(r.html);
            lines.push("```");
          }
          lines.push("");
        });
        const text = lines.join("\n");
        try { console.error("[Tool:search] returning", { kind: "text-only", length: text.length, urls: urls.length }); } catch {}
        return { content: [{ type: "text", text }], _meta: { urls } } as any;
      }
    } catch (err: any) {
      const msg = String(err?.message || err);
      return { content: [{ type: "text", text: `Search failed: ${msg}` }], _meta: { urls: [] } } as any;
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
