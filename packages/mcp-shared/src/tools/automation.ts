/**
 * Automation tools: click, type, drag
 * Shared between mcp-server and mcp-web-client
 */

import { getToolSchema } from './schemas.js';
import { toToolResult, toErrorResult } from './handlers.js';
import { sanitizeClickParams, sanitizeTypeParams, sanitizeDragParams } from '../utils/sanitize.js';
import type { Tool, ToolHandlerOptions } from '../types/index.js';

export function createBrowserClick(options: ToolHandlerOptions): Tool {
  return {
    schema: getToolSchema('browser_click'),
    handle: async (params) => {
      const { error, target } = sanitizeClickParams(params);
      if (error) {
        return toErrorResult(error);
      }

      const response = await options.call('browser_click', { target });
      return toToolResult(response);
    },
  };
}

export function createBrowserType(options: ToolHandlerOptions): Tool {
  return {
    schema: getToolSchema('browser_type'),
    handle: async (params) => {
      const { error, ...sanitized } = sanitizeTypeParams(params);
      if (error) {
        return toErrorResult(error);
      }

      const response = await options.call('browser_type', sanitized);
      return toToolResult(response);
    },
  };
}

export function createBrowserDrag(options: ToolHandlerOptions): Tool {
  return {
    schema: getToolSchema('browser_drag'),
    handle: async (params) => {
      const { error, ...sanitized } = sanitizeDragParams(params);
      if (error) {
        return toErrorResult(error);
      }

      const response = await options.call('browser_drag', sanitized);
      return toToolResult(response);
    },
  };
}
