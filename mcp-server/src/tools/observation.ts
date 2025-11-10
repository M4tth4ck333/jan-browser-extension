/**
 * Browser observation tools
 * Tools for capturing page state: snapshot, screenshot, web search, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection, setActiveTabId } from "../utils/bridge.js";
import { captureAriaSnapshot } from "../utils/aria-snapshot.js";
import type { Tool, ToolResult } from "./tool.js";

/**
 * Capture a comprehensive snapshot of the CURRENTLY ACTIVE TAB
 * Operates on whatever tab was opened with browser_navigate
 */
const SnapshotSchema = z.object({});

export const browserSnapshot: Tool = {
  schema: {
    name: "browser_snapshot",
    description: "Capture accessibility snapshot of the current page. Use this for getting references to elements to interact with.",
    inputSchema: zodToJsonSchema(SnapshotSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    try {
      return await captureAriaSnapshot();
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Snapshot failed: ${String(err?.message || err)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Capture a screenshot of the CURRENTLY ACTIVE TAB
 * Operates on whatever tab was opened with browser_navigate
 */
const ScreenshotSchema = z.object({});

export const browserScreenshot: Tool = {
  schema: {
    name: "browser_screenshot",
    description: "Take a screenshot of the current page",
    inputSchema: zodToJsonSchema(ScreenshotSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    try {
      const data = await callExtension("screenshot", {});

      const direct = useExtensionResult(data);
      if (direct) {
        return direct;
      }

      // Validate screenshot data exists and is not empty
      const screenshot = data?.data?.screenshot;
      if (!screenshot || typeof screenshot !== 'string' || screenshot.trim().length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "Screenshot failed: No image data returned from browser. The page may not be accessible or the tab may have been closed.",
            },
          ],
          isError: true,
        };
      }

      if (typeof data?.data?.tabId === "number") {
        setActiveTabId(data.data.tabId);
      }

      // Extract base64 data from data URL (remove "data:image/png;base64," prefix)
      // The screenshot from extension comes as: "data:image/png;base64,iVBORw0KGgo..."
      let base64Data = screenshot;
      let mimeType = "image/png";

      if (screenshot.startsWith("data:")) {
        const match = screenshot.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          mimeType = match[1];
          base64Data = match[2];
        }
      }

      // Return image content using proper MCP protocol format
      // According to MCP specification, images should use type: "image" with base64 data
      return {
        content: [
          {
            type: "image",
            data: base64Data,
            mimeType: mimeType,
          },
        ],
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
    description: "Search the web and return SERP results (titles, URLs, snippets, optional knowledge graph and People Also Ask).",
    inputSchema: zodToJsonSchema(WebSearchSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    try {
      const data = await callExtension("search", params);

      const direct = useExtensionResult(data);
      if (direct) {
        return direct;
      }

      const result = data.data;
      const format = params.format || "serper";

      if (format === "text") {
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
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        _meta: { urls: result.urls || [] },
      };
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

function useExtensionResult(data: any): ToolResult | null {
  if (Array.isArray(data?.content)) {
    if (typeof data?._meta?.tabId === "number") {
      setActiveTabId(data._meta.tabId);
    } else if (typeof data?.data?.tabId === "number") {
      setActiveTabId(data.data.tabId);
    }

    const result: ToolResult = {
      content: data.content,
    };

    if (data._meta) {
      result._meta = data._meta;
    }

    if (data.isError) {
      result.isError = data.isError;
    }

    return result;
  }

  return null;
}

/**
 * Get current browser status
 */
const BridgeStatusSchema = z.object({});

export const bridgeStatus: Tool = {
  schema: {
    name: "bridge_status",
    description: "Check whether the browser extension is connected to the MCP bridge.",
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
