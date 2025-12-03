/**
 * Browser navigation tools
 * Tools for navigating web pages, going back/forward, scrolling, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection } from "../utils/bridge.js";
import { sanitizeNavigateParams } from "./sanitize.js";
import type { Tool, ToolResult } from "./tool.js";

const NavigateSchema = z.object({
  target: z
    .string()
    .describe('Where to go: full URL, bare domain (we add https://), or "back"/"forward" for history navigation'),
});

export const browserNavigate: Tool = {
  schema: {
    name: "browser_navigate",
    description:
      'Navigate the active tab: open a URL or move browser history. Pass "target" as a URL/domain (https added if missing) or "back"/"forward".',
    inputSchema: zodToJsonSchema(NavigateSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    const { target, error } = sanitizeNavigateParams(params);
    if (error) {
      return {
        content: [{ type: "text", text: error }],
        isError: true,
      };
    }
    const rawTarget = target;
    if (!rawTarget) {
      return toTextResult("No navigation target provided");
    }

    const lowered = rawTarget.toLowerCase();
    if (lowered === "back" || lowered === "backward") {
      const data = await callExtension("browser_navigate", { direction: "back" });
      const targetUrl = data?.data?.url;
      return toTextResult(targetUrl ? `Navigated back to ${targetUrl}` : "Navigated back");
    }

    if (lowered === "forward") {
      const data = await callExtension("browser_navigate", { direction: "forward" });
      const targetUrl = data?.data?.url;
      return toTextResult(targetUrl ? `Navigated forward to ${targetUrl}` : "Navigated forward");
    }

    let url = rawTarget;
    if (url && !url.match(/^https?:\/\//i)) {
      url = `https://${url}`;
    }

    const data = await callExtension("browser_navigate", { url, closeTab: false });
    const targetUrl = data?.data?.url || url;
    return toTextResult(`Navigated to ${targetUrl}`);
  },
};

const ScrollSchema = z.object({
  direction: z.enum(["up", "down", "top", "bottom"]).describe("Scroll direction/position for the current page or element"),
  amount: z.number().optional().describe("Pixels to scroll for up/down (default 500). Ignored for top/bottom."),
  target: z
    .string()
    .optional()
    .describe("Optional snapshot ref (e.g., 's1e1') to scroll a specific element instead of the page"),
});

export const browserScroll: Tool = {
  schema: {
    name: "browser_scroll",
    description: "Scroll the current page or a referenced element; directions: up/down/top/bottom. amount controls pixel distance for up/down.",
    inputSchema: zodToJsonSchema(ScrollSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    await callExtension("browser_scroll", params);
    return toTextResult(`Scrolled ${params.direction}`);
  },
};


function toTextResult(text: string): ToolResult {
  return {
    content: [
      {
        type: "text",
        text,
      },
    ],
  };
}
