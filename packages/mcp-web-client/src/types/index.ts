// Re-export shared types from mcp-shared
export {
  type ToolCallRequest,
  type ToolCallResponse,
  type HelloMessage,
  type PingMessage,
  type PongMessage,
  type ErrorMessage,
  type ToolName,
  type ToolSchema,
  type ToolResult,
  type ToolResultContent,
  DEFAULT_TOOL_TIMEOUT_MS,
} from '@janhq/mcp-shared';

import type {
  ToolCallResponse,
  HelloMessage,
  PongMessage,
  ErrorMessage,
} from '@janhq/mcp-shared';

/**
 * Union of all message types from extension
 */
export type ExtensionMessage =
  | ToolCallResponse
  | HelloMessage
  | PongMessage
  | ErrorMessage;

/**
 * Configuration for McpWebClient
 */
export interface McpWebClientConfig {
  /** Chrome extension ID (required) */
  extensionId: string;
  /** Timeout for tool calls in milliseconds (default: 30000) */
  timeout?: number;
}

/**
 * Result of browser/extension detection
 */
export interface DetectionResult {
  /** Whether the browser is Chrome/Chromium-based */
  isChrome: boolean;
  /** Whether chrome.runtime API is available */
  hasChromeRuntime: boolean;
  /** Whether the extension is installed and responding */
  isExtensionAvailable: boolean;
  /** Extension version if available */
  extensionVersion?: string;
  /** Error message if detection failed */
  error?: string;
}

/**
 * Connection state of the client
 */
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Event handler types
 */
export interface McpWebClientEvents {
  connect: () => void;
  disconnect: (reason?: string) => void;
  error: (error: Error) => void;
  stateChange: (state: ConnectionState) => void;
}

export type EventName = keyof McpWebClientEvents;
export type EventHandler<T extends EventName> = McpWebClientEvents[T];
