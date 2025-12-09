/**
 * Shared tool types for both mcp-server and mcp-web-client
 */

// ============================================================================
// Tool Names
// ============================================================================

/**
 * Available tool names (exposed to MCP)
 */
export type ToolName =
  | 'browser_click'
  | 'browser_type'
  | 'browser_navigate'
  | 'browser_scroll'
  | 'browser_screenshot'
  | 'browser_snapshot';

/**
 * Disabled tool names (temporarily disabled from MCP listing)
 */
export type DisabledToolName = 'browser_drag';

/**
 * Internal tool names (not exposed to MCP, used internally only)
 */
export type InternalToolName = 'browser_get_url' | 'browser_get_title';

/**
 * All tool names (including disabled and internal)
 */
export type AllToolName = ToolName | DisabledToolName | InternalToolName;

// ============================================================================
// Tool Schema & Result (MCP format)
// ============================================================================

/**
 * Tool schema definition (MCP format)
 */
export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Tool result content item (MCP format)
 */
export interface ToolResultContent {
  type: 'text' | 'image';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * Tool result with metadata (MCP format)
 */
export interface ToolResult {
  content: ToolResultContent[];
  isError?: boolean;
  _meta?: {
    urls?: string[];
    tabId?: number | null;
  };
}

// ============================================================================
// Extension Caller
// ============================================================================

/**
 * Response from extension caller
 */
export interface ExtensionCallerResponse {
  ok?: boolean;
  content?: Array<{
    type: 'text' | 'image';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  _meta?: {
    urls?: string[];
    tabId?: number | null;
  };
  data?: unknown;
  error?: string;
  isError?: boolean;
}

/**
 * Function signature for calling the extension
 * Both WebSocket bridge and chrome.runtime use this same signature
 */
export type ExtensionCaller = (
  tool: string,
  params: Record<string, unknown>
) => Promise<ExtensionCallerResponse>;

/**
 * Callback for tracking active tab ID
 */
export type TabIdTracker = (tabId: number) => void;

// ============================================================================
// Tool Handler
// ============================================================================

/**
 * Tool definition with schema and handler
 */
export interface Tool {
  schema: ToolSchema;
  handle: (params: Record<string, unknown>) => Promise<ToolResult>;
}

/**
 * Options for creating tool handlers
 */
export interface ToolHandlerOptions {
  /** Function to call the extension */
  call: ExtensionCaller;
  /** Optional callback when tabId is received */
  onTabId?: TabIdTracker;
}
