/**
 * Browser navigation tools
 * Tools for navigating web pages, going back/forward, scrolling, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection, setActiveTabId, getActiveTabId } from "../utils/bridge.js";
import { captureAriaSnapshot } from "../utils/aria-snapshot.js";
import type { Tool } from "./tool.js";

/**
 * Navigate to a specific URL and extract readable content
 */
const NavigateSchema = z.object({
  url: z.string().describe("The URL to navigate to and extract content from"),
  mode: z.enum(["markdown", "html", "text"]).optional().describe("Content format to extract (default: markdown)"),
  maxContentLength: z.number().min(1000).max(500000).optional().describe("Maximum content length in characters (default: 100000)"),
  keepTabOpen: z.boolean().optional().describe("Keep the tab open after navigation for subsequent operations (default: false). Set to true for multi-step workflows."),
});

export const navigate: Tool = {
  schema: {
    name: "browser_navigate",
    description: "Navigate to a specific URL using the browser extension and extract the page's readable content. Returns the main article/text content in markdown, HTML, or plain text format. Use keepTabOpen=true for multi-step workflows where you need to perform subsequent actions on the same page (clicking, filling forms, etc.).",
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

    // Pass keepTabOpen parameter to extension
    const keepTabOpen = params.keepTabOpen || false;

    try {
      const data = await callExtension("visit", { ...params, url, keepTabOpen });

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

      // Store the tab ID if keeping it open
      if (keepTabOpen && result.tabId) {
        setActiveTabId(result.tabId);
      }

      return {
        content: [
          {
            type: "text",
            text: `Navigated to ${result.url}\n\nTitle: ${result.title}\n\n${content}${keepTabOpen ? '\n\n[Tab kept open for subsequent operations]' : ''}`,
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
const GoBackSchema = z.object({
  url: z.string().describe("The current page URL (required to identify the tab)"),
});

export const goBack: Tool = {
  schema: {
    name: "go_back",
    description: "Navigate back to the previous page in browser history.",
    inputSchema: zodToJsonSchema(GoBackSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("go_back", params);

    return captureAriaSnapshot(data.data.url, "Navigated back");
  },
};

/**
 * Go forward in browser history
 */
const GoForwardSchema = z.object({
  url: z.string().describe("The current page URL (required to identify the tab)"),
});

export const goForward: Tool = {
  schema: {
    name: "go_forward",
    description: "Navigate forward to the next page in browser history.",
    inputSchema: zodToJsonSchema(GoForwardSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("go_forward", params);

    return captureAriaSnapshot(data.data.url, "Navigated forward");
  },
};

/**
 * Scroll the page
 */
const ScrollSchema = z.object({
  url: z.string().describe("The URL of the page to scroll"),
  direction: z.enum(["up", "down", "top", "bottom"]).describe("Scroll direction or position"),
  amount: z.number().optional().describe("Scroll amount in pixels (for 'up' and 'down' directions, default: 500)"),
});

export const scroll: Tool = {
  schema: {
    name: "scroll",
    description: "Scroll the page up or down by a specified amount or to a specific position.",
    inputSchema: zodToJsonSchema(ScrollSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }
    const data = await callExtension("scroll_page", params);

    return captureAriaSnapshot(params.url, `Scrolled ${params.direction}`);
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
