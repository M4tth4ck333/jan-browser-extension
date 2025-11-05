/**
 * Browser observation tools
 * Tools for capturing page state: snapshot, screenshot, web search, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection } from "../utils/bridge.js";
import { captureAriaSnapshot } from "../utils/aria-snapshot.js";
import type { Tool } from "./tool.js";

/**
 * Capture a comprehensive snapshot of the page with ARIA tree
 */
const SnapshotSchema = z.object({
  url: z.string().describe("The URL of the page to snapshot"),
});

export const snapshot: Tool = {
  schema: {
    name: "snapshot",
    description: "Capture a comprehensive snapshot of a web page including: ARIA accessibility tree (roles, labels, interactive elements, landmarks), full HTML, metadata (title, description), links, images, forms, headings, and viewport info. Inspired by browsermcp's ARIA snapshot. Returns structured data about the page for analysis and browser automation. The ARIA tree helps LLMs understand page structure and interactive elements for automation tasks.",
    inputSchema: zodToJsonSchema(SnapshotSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    return captureAriaSnapshot(params.url);
  },
};

/**
 * Capture a screenshot of the page
 */
const ScreenshotSchema = z.object({
  url: z.string().describe("The URL of the page to screenshot"),
  fullPage: z.boolean().optional().describe("Capture full page or just viewport (default: false)"),
  format: z.enum(["png", "jpeg"]).optional().describe("Image format (default: png)"),
  quality: z.number().min(1).max(100).optional().describe("JPEG quality 1-100 (default: 90)"),
});

export const screenshot: Tool = {
  schema: {
    name: "screenshot",
    description: "Capture a screenshot of a web page via the browser extension. Returns a base64-encoded image.",
    inputSchema: zodToJsonSchema(ScreenshotSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    try {
      const data = await callExtension("screenshot", params);

      return {
        content: [
          {
            type: "text",
            text: `Screenshot captured from ${params.url}`,
          },
          {
            type: "image",
            data: data.data.screenshot,
            mimeType: `image/${params.format || "png"}`,
          },
        ],
        _meta: { urls: [params.url] },
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Screenshot failed: ${String(err?.message || err)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Search the web using Google via the browser extension
 */
const WebSearchSchema = z.object({
  query: z.string().min(1).describe("The search query to execute"),
  numResults: z.number().min(1).max(10).optional().describe("Number of results (1-10, default: 5)"),
  format: z.enum(["serper", "text"]).optional().describe("Response format (default: serper)"),
});

export const webSearch: Tool = {
  schema: {
    name: "web_search",
    description: "Search the web via Google by asking the installed browser extension to perform the search and scrape the SERP. Returns search results with titles, URLs, snippets, and optionally knowledge graph and People Also Ask sections.",
    inputSchema: zodToJsonSchema(WebSearchSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    try {
      const data = await callExtension("search", params);

      // Format the search results
      const result = data.data;
      const format = params.format || "serper";

      if (format === "text") {
        // Human-readable text format
        let text = `Search results for: ${params.query}\n\n`;

        if (result.knowledgeGraph) {
          const kg = result.knowledgeGraph;
          text += `Knowledge Graph: ${kg.title || ""}\n${kg.description || ""}\n\n`;
        }

        if (result.organic?.length > 0) {
          text += "Results:\n";
          for (const item of result.organic) {
            text += `\n${item.position}. ${item.title}\n`;
            text += `   ${item.url}\n`;
            if (item.snippet) text += `   ${item.snippet}\n`;
          }
        }

        if (result.peopleAlsoAsk?.length > 0) {
          text += "\n\nPeople Also Ask:\n";
          for (const paa of result.peopleAlsoAsk) {
            text += `\nQ: ${paa.question}\n`;
            text += `A: ${paa.snippet || ""}\n`;
          }
        }

        return {
          content: [{ type: "text", text }],
          _meta: { urls: result.urls || [] },
        };
      } else {
        // Structured JSON format (serper-like)
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          _meta: { urls: result.urls || [] },
        };
      }
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Search failed: ${String(err?.message || err)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Get current browser status
 */
const BridgeStatusSchema = z.object({});

export const bridgeStatus: Tool = {
  schema: {
    name: "bridge_status",
    description: "Check if the browser extension is connected to the MCP bridge.",
    inputSchema: zodToJsonSchema(BridgeStatusSchema) as any,
  },
  handle: async () => {
    const connected = hasExtensionConnection();

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ connected, timestamp: new Date().toISOString() }),
        },
      ],
    };
  },
};
