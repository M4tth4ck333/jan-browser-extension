/**
 * mcp-web-client - Browser client for Jan Browser MCP extension
 *
 * Connects to the extension via chrome.runtime API
 * Use toToolResult() to normalize responses to match mcp-server format
 */

// Connection layer (chrome.runtime)
export { McpWebClient } from './connection/client.js';

// Utils
export {
  isChromeBrowser,
  hasChromeRuntime,
  isExtensionAvailable,
  detectExtension,
} from './utils/detect.js';

export {
  McpWebClientError,
  BrowserNotSupportedError,
  ExtensionNotAvailableError,
  ConnectionError,
  ToolCallError,
  TimeoutError,
  NotConnectedError,
} from './utils/errors.js';

// Types
export type {
  ToolCallRequest,
  ToolCallResponse,
  HelloMessage,
  PingMessage,
  PongMessage,
  ErrorMessage,
  ExtensionMessage,
  McpWebClientConfig,
  DetectionResult,
  ConnectionState,
  McpWebClientEvents,
  EventName,
  EventHandler,
  ToolName,
  ToolSchema,
  ToolResult,
  ToolResultContent,
} from './types/index.js';

// Re-exports from mcp-shared
// Tool schemas (shared with mcp-server)
export {
  TOOL_SCHEMAS,
  getToolSchemas,
  getAllToolSchemas,
  TOOL_DEFINITIONS,
  getToolSchema,
} from '@janhq/mcp-shared';

// Result handler (shared with mcp-server)
// Use toToolResult() to convert ToolCallResponse to ToolResult for consistent format
export {
  toToolResult,
  toErrorResult,
  type ExtensionResponse,
} from '@janhq/mcp-shared';
