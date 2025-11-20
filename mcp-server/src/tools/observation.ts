/**
 * Browser observation tools
 * Tools for capturing page state: snapshot, screenshot, web search, etc.
 */
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { callExtension, waitForBridgeConnection, hasExtensionConnection, setActiveTabId } from "../utils/bridge.js";
import { captureAriaSnapshot } from "../utils/aria-snapshot.js";
import type { Tool, ToolResult } from "./tool.js";
import { sanitizeSnapshotParams, sanitizeScreenshotParams } from "./sanitize.js";

/**
 * Capture a comprehensive snapshot of the CURRENTLY ACTIVE TAB
 * Operates on whatever tab was opened with browser_navigate
 */
const SnapshotSchema = z.object({
  fullPage: z.boolean().optional().describe("Capture full page (true) or only viewport-visible content (false). Default: true"),
});

export const browserSnapshot: Tool = {
  schema: {
    name: "browser_snapshot",
    description: "Capture an accessibility snapshot of the current tab. Use fullPage=false for viewport-only.",
    inputSchema: zodToJsonSchema(SnapshotSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    try {
      const { fullPage } = sanitizeSnapshotParams(params);
      return await captureAriaSnapshot(undefined, "", fullPage);
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
const ScreenshotSchema = z.object({
  includeRefs: z
    .boolean()
    .optional()
    .describe("Whether to show snapshot refs inline before capturing the screenshot. Default: true"),
});

export const browserScreenshot: Tool = {
  schema: {
    name: "browser_screenshot",
    description: "Screenshot the current tab; optionally overlay snapshot refs (includeRefs=true, default).",
    inputSchema: zodToJsonSchema(ScreenshotSchema) as any,
  },
  handle: async (params) => {
    if (!hasExtensionConnection()) {
      await waitForBridgeConnection(4000);
    }

    try {
      const { includeRefs } = sanitizeScreenshotParams(params);
      const data = await callExtension("browser_screenshot", {
        includeRefs,
      });

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
