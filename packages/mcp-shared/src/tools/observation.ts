/**
 * Observation tools: snapshot, screenshot
 * Shared between mcp-server and mcp-web-client
 */

import { getToolSchema } from './schemas.js';
import { toToolResult, toErrorResult } from './handlers.js';
import { sanitizeSnapshotParams, sanitizeScreenshotParams } from '../utils/sanitize.js';
import type { Tool, ToolHandlerOptions } from '../types/index.js';

export function createBrowserSnapshot(options: ToolHandlerOptions): Tool {
  return {
    schema: getToolSchema('browser_snapshot'),
    handle: async (params) => {
      try {
        const { fullPage, detailLevel } = sanitizeSnapshotParams(params);
        const response = await options.call('browser_snapshot', {
          fullPage,
          detail: detailLevel,
        });

        // Track tabId if callback provided
        const tabId = response?._meta?.tabId ?? (response?.data as { tabId?: number })?.tabId;
        if (typeof tabId === 'number' && options.onTabId) {
          options.onTabId(tabId);
        }

        return toToolResult(response);
      } catch (err) {
        return toErrorResult('Snapshot failed', err);
      }
    },
  };
}

export function createBrowserScreenshot(options: ToolHandlerOptions): Tool {
  return {
    schema: getToolSchema('browser_screenshot'),
    handle: async (params) => {
      try {
        const { includeRefs, detailLevel } = sanitizeScreenshotParams(params);
        const response = await options.call('browser_screenshot', {
          includeRefs: includeRefs === true,
          detail: detailLevel,
        });

        // Track tabId if callback provided
        const tabId = response?._meta?.tabId ?? (response?.data as { tabId?: number })?.tabId;
        if (typeof tabId === 'number' && options.onTabId) {
          options.onTabId(tabId);
        }

        return toToolResult(response);
      } catch (err) {
        return toErrorResult('Screenshot failed', err);
      }
    },
  };
}
