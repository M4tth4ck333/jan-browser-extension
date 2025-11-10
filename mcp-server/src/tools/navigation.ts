/**
 * Browser navigation tools
 * Tools for navigating web pages, going back/forward, scrolling, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection, setActiveTabId, getActiveTabId } from "../utils/bridge.js";
import { captureAriaSnapshot } from "../utils/aria-snapshot.js";
import type { Tool, ToolResult } from "./tool.js";

/**
 * Navigate to a specific URL and extract readable content
 */
const NavigateSchema = z.object({
  url: z.string().describe("The URL to navigate to and extract content from"),
  mode: z.enum(["markdown", "html", "text"]).optional().describe("Content format to extract (default: markdown)"),
  maxContentLength: z.number().min(1000).max(500000).optional().describe("Maximum content length in characters (default: 100000)"),
  closeTab: z.boolean().optional().describe("Close the tab after extracting content (default: false). Set to true for one-off content extraction. Tabs stay open by default for agentic workflows."),
});

export const navigate: Tool = {
  schema: {
    name: "navigate_browser",
    description: "Navigate to a specific URL using the browser extension and extract the page's readable content. Returns the main article/text content in markdown, HTML, or plain text format. By default, tabs stay open for subsequent operations (agentic workflows). Set closeTab=true for one-off content extraction.",
    inputSchema: zodToJsonSchema(NavigateSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    // Ensure URL has protocol
    let url = params.url;
    if (url && !url.match(/^https?:\/\//i)) {
      url = `https://${url}`;
    }

    // By default, keep tabs open (agentic workflow pattern)
    const closeTab = params.closeTab || false;

    try {
      const data = await callExtension("visit", { ...params, url, closeTab });

      const result = data.data;
      const mode = params.mode || "markdown";
      let content = "";

      if (mode === "html" && result.html) {
        content = `\`\`\`html\n${result.html}\n\`\`\``;
      } else if (mode === "text" && result.text) {
        content = result.text;
      } else if (result.markdown) {
        content = result.markdown;
      } else {
        content = result.text || result.html || "";
      }

      // Always store the tab ID for registration (unless explicitly closed)
      if (!closeTab && result.tabId) {
        setActiveTabId(result.tabId);
      }

      return {
        content: [
          {
            type: "text",
            text: `Navigated to ${result.url}\n\nTitle: ${result.title}\n\n${content}${closeTab ? '' : '\n\n[Tab kept open for subsequent operations]'}`,
          },
        ],
        _meta: { urls: [result.url], tabId: result.tabId },
      };
    } catch (err: any) {
      return {
        content: [
          {
            type: "text",
            text: `Navigation failed: ${String(err?.message || err)}`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Go back in browser history
 */
const GoBackSchema = z.object({});

export const goBack: Tool = {
  schema: {
    name: "go_back",
    description: "Navigate back to the previous page in browser history on the currently active tab. First use navigate_browser to load a page, then use this tool to navigate.",
    inputSchema: zodToJsonSchema(GoBackSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("go_back", params);

    const direct = useExtensionResult(data);
    if (direct) {
      return direct;
    }

    return captureAriaSnapshot(data.data.url, "Navigated back");
  },
};

/**
 * Go forward in browser history
 */
const GoForwardSchema = z.object({});

export const goForward: Tool = {
  schema: {
    name: "go_forward",
    description: "Navigate forward to the next page in browser history on the currently active tab. First use navigate_browser to load a page, then use this tool to navigate.",
    inputSchema: zodToJsonSchema(GoForwardSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("go_forward", params);

    const direct = useExtensionResult(data);
    if (direct) {
      return direct;
    }

    return captureAriaSnapshot(data.data.url, "Navigated forward");
  },
};

/**
 * Scroll the page
 */
const ScrollSchema = z.object({
  direction: z.enum(["up", "down", "top", "bottom"]).describe("Scroll direction or position"),
  amount: z.number().optional().describe("Scroll amount in pixels (for 'up' and 'down' directions, default: 500)"),
});

export const scroll: Tool = {
  schema: {
    name: "scroll",
    description: "Scroll the currently active tab up or down by a specified amount or to a specific position. First use navigate_browser to load a page, then use this tool to scroll. Returns snapshot after scrolling.",
    inputSchema: zodToJsonSchema(ScrollSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("scroll_page", params);

    const direct = useExtensionResult(data);
    if (direct) {
      return direct;
    }

    return captureAriaSnapshot(data.data.url, `Scrolled ${params.direction}`);
  },
};

/**
 * Wait for a specified time
 */
const WaitSchema = z.object({
  seconds: z.number().min(0.1).max(10).describe("Number of seconds to wait (max 10)"),
});

export const wait: Tool = {
  schema: {
    name: "wait",
    description: "Wait for a specified number of seconds. Useful for waiting for page loads or animations.",
    inputSchema: zodToJsonSchema(WaitSchema) as any,
  },
  handle: async (params) => {
    const ms = Math.min(params.seconds * 1000, 10000);
    await new Promise((resolve) => setTimeout(resolve, ms));

    return {
      content: [
        {
          type: "text",
          text: `Waited for ${params.seconds} seconds`,
        },
      ],
    };
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
