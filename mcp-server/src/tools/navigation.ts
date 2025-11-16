/**
 * Browser navigation tools
 * Tools for navigating web pages, going back/forward, scrolling, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection } from "../utils/bridge.js";
import type { Tool, ToolResult } from "./tool.js";

const NavigateSchema = z.object({
  url: z.string().describe("The URL to navigate to"),
});

export const browserNavigate: Tool = {
  schema: {
    name: "browser_navigate",
    description: "Navigate to a URL",
    inputSchema: zodToJsonSchema(NavigateSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    let url = params.url;
    if (url && !url.match(/^https?:\/\//i)) {
      url = `https://${url}`;
    }

    const data = await callExtension("browser_navigate", { url, closeTab: false });
    const targetUrl = data?.data?.url || url;
    return toTextResult(`Navigated to ${targetUrl}`);
  },
};

const GoBackSchema = z.object({});

export const browserGoBack: Tool = {
  schema: {
    name: "browser_go_back",
    description: "Go back to the previous page",
    inputSchema: zodToJsonSchema(GoBackSchema) as any,
  },
  handle: async () => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    const data = await callExtension("browser_go_back", {});
    const targetUrl = data?.data?.url;
    return toTextResult(targetUrl ? `Navigated back to ${targetUrl}` : "Navigated back");
  },
};

const GoForwardSchema = z.object({});

export const browserGoForward: Tool = {
  schema: {
    name: "browser_go_forward",
    description: "Go forward to the next page",
    inputSchema: zodToJsonSchema(GoForwardSchema) as any,
  },
  handle: async () => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    const data = await callExtension("browser_go_forward", {});
    const targetUrl = data?.data?.url;
    return toTextResult(targetUrl ? `Navigated forward to ${targetUrl}` : "Navigated forward");
  },
};

const ScrollSchema = z.object({
  direction: z.enum(["up", "down", "top", "bottom"]).describe("Scroll direction or position"),
  amount: z.number().optional().describe("Scroll amount in pixels (for 'up' and 'down' directions, default: 500)"),
});

export const browserScroll: Tool = {
  schema: {
    name: "browser_scroll",
    description: "Scroll the page",
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

const WaitSchema = z.object({
  time: z.number().min(0.1).max(10).describe("The time to wait in seconds"),
});

export const browserWait: Tool = {
  schema: {
    name: "browser_wait",
    description: "Wait for a specified time in seconds",
    inputSchema: zodToJsonSchema(WaitSchema) as any,
  },
  handle: async (params) => {
    const milliseconds = Math.min(params.time * 1000, 10000);
    await new Promise((resolve) => setTimeout(resolve, milliseconds));

    return {
      content: [
        {
          type: "text",
          text: `Waited for ${params.time} seconds`,
        },
      ],
    };
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
