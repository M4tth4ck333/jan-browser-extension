/**
 * Shared message types for MCP communication protocol
 * Used by both mcp-server (WebSocket) and mcp-web-client (chrome.runtime)
 */

/** Message kinds for the communication protocol */
export type MessageKind = 'call' | 'result' | 'hello' | 'ping' | 'pong' | 'error';

/** Tool call request message */
export interface ToolCallRequest {
  kind: 'call';
  id: string;
  tool: string;
  params: Record<string, unknown>;
}

/** Tool call response message */
export interface ToolCallResponse {
  kind: 'result';
  id: string;
  ok: boolean;
  /** MCP-formatted content array (text/image) */
  content?: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  /** Metadata (urls, tabId) */
  _meta?: {
    urls?: string[];
    tabId?: number | null;
  };
  /** Raw data from extension (for backwards compatibility) */
  data?: unknown;
  /** Error message if ok=false */
  error?: string;
  /** Whether this is an error response */
  isError?: boolean;
}

/** Hello message sent on connection */
export interface HelloMessage {
  kind: 'hello';
  version: string;
  serverVersion?: string;
}

/** Ping message for keep-alive */
export interface PingMessage {
  kind: 'ping';
}

/** Pong response to ping */
export interface PongMessage {
  kind: 'pong';
  version?: string;
}

/** Error message */
export interface ErrorMessage {
  kind: 'error';
  error: string;
}

/** Union of all shared message types */
export type Message =
  | ToolCallRequest
  | ToolCallResponse
  | HelloMessage
  | PingMessage
  | PongMessage
  | ErrorMessage;
