/**
 * Base error class for MCP Web Client
 */
export class McpWebClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpWebClientError';
  }
}

/**
 * Error thrown when browser is not supported (not Chrome/Chromium-based)
 */
export class BrowserNotSupportedError extends McpWebClientError {
  constructor() {
    super('Browser not supported. Please use Chrome, Edge, Brave, or another Chromium-based browser.');
    this.name = 'BrowserNotSupportedError';
  }
}

/**
 * Error thrown when extension is not installed or not responding
 */
export class ExtensionNotAvailableError extends McpWebClientError {
  constructor(extensionId: string) {
    super(`Extension not available. Please ensure the extension (${extensionId}) is installed and enabled.`);
    this.name = 'ExtensionNotAvailableError';
  }
}

/**
 * Error thrown when connection to extension fails
 */
export class ConnectionError extends McpWebClientError {
  public readonly reason?: string;

  constructor(message: string, reason?: string) {
    super(message);
    this.name = 'ConnectionError';
    this.reason = reason;
  }
}

/**
 * Error thrown when a tool call fails
 */
export class ToolCallError extends McpWebClientError {
  public readonly toolName: string;
  public readonly toolError?: string;

  constructor(toolName: string, error?: string) {
    super(`Tool call '${toolName}' failed: ${error || 'Unknown error'}`);
    this.name = 'ToolCallError';
    this.toolName = toolName;
    this.toolError = error;
  }
}

/**
 * Error thrown when a tool call times out
 */
export class TimeoutError extends McpWebClientError {
  public readonly toolName: string;
  public readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool call '${toolName}' timed out after ${timeoutMs}ms`);
    this.name = 'TimeoutError';
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when client is not connected
 */
export class NotConnectedError extends McpWebClientError {
  constructor() {
    super('Client is not connected. Call connect() first.');
    this.name = 'NotConnectedError';
  }
}
