/**
 * Shared result handler for normalizing tool responses
 * Ensures both mcp-server and mcp-web-client return identical ToolResult format
 */
import type { ToolResult, ToolResultContent } from '../types/index.js';

/**
 * Raw response from extension (via WebSocket bridge or chrome.runtime)
 */
export interface ExtensionResponse {
  kind?: 'result';
  id?: string;
  ok?: boolean;
  content?: ToolResultContent[];
  _meta?: {
    urls?: string[];
    tabId?: number | null;
  };
  data?: unknown;
  error?: string;
  isError?: boolean;
}

/**
 * Extract ToolResult from extension response
 * This ensures identical output format regardless of connection method
 */
export function toToolResult(response: ExtensionResponse): ToolResult {
  // If response has content array, use it (already MCP formatted)
  if (Array.isArray(response?.content) && response.content.length > 0) {
    const result: ToolResult = {
      content: response.content,
    };

    if (response._meta) {
      result._meta = response._meta;
    }

    if (response.isError) {
      result.isError = true;
    }

    return result;
  }

  // Error response without content
  if (response?.ok === false || response?.isError || response?.error) {
    return {
      content: [
        {
          type: 'text',
          text: response.error || 'Unknown error',
        },
      ],
      isError: true,
    };
  }

  // Fallback: no content returned
  return {
    content: [
      {
        type: 'text',
        text: 'No content returned from extension',
      },
    ],
    isError: true,
  };
}

/**
 * Create an error ToolResult
 */
export function toErrorResult(message: string, error?: unknown): ToolResult {
  const errorText = error
    ? `${message}: ${error instanceof Error ? error.message : String(error)}`
    : message;

  return {
    content: [
      {
        type: 'text',
        text: errorText,
      },
    ],
    isError: true,
  };
}
