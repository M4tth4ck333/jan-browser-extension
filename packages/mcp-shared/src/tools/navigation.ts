/**
 * Navigation tools: navigate, scroll
 * Shared between mcp-server and mcp-web-client
 */

import { getToolSchema } from './schemas.js';
import { toToolResult, toErrorResult } from './handlers.js';
import { sanitizeNavigateParams, sanitizeScrollParams } from '../utils/sanitize.js';
import type { Tool, ToolHandlerOptions } from '../types/index.js';

export function createBrowserNavigate(options: ToolHandlerOptions): Tool {
  return {
    schema: getToolSchema('browser_navigate'),
    handle: async (params) => {
      const { target, error } = sanitizeNavigateParams(params);
      if (error) {
        return toErrorResult(error);
      }

      if (!target) {
        return toErrorResult('No navigation target provided');
      }

      const lowered = target.toLowerCase();
      if (lowered === 'back' || lowered === 'backward') {
        const response = await options.call('browser_navigate', { direction: 'back' });
        return toToolResult(response);
      }

      if (lowered === 'forward') {
        const response = await options.call('browser_navigate', { direction: 'forward' });
        return toToolResult(response);
      }

      let url = target;
      if (url && !url.match(/^https?:\/\//i)) {
        url = `https://${url}`;
      }

      const response = await options.call('browser_navigate', { url, closeTab: false });
      return toToolResult(response);
    },
  };
}

export function createBrowserScroll(options: ToolHandlerOptions): Tool {
  return {
    schema: getToolSchema('browser_scroll'),
    handle: async (params) => {
      const { error, ...sanitized } = sanitizeScrollParams(params);
      if (error) {
        return toErrorResult(error);
      }

      const response = await options.call('browser_scroll', sanitized);
      return toToolResult(response);
    },
  };
}
