/**
 * mcp-shared - Common types and schemas for MCP packages
 *
 * Shared between:
 * - mcp-server (WebSocket bridge to MCP clients)
 * - mcp-web-client (direct chrome.runtime connection)
 */

// ============================================================================
// Types - all type definitions
// ============================================================================

export {
  // Message types
  type MessageKind,
  type ToolCallRequest,
  type ToolCallResponse,
  type HelloMessage,
  type PingMessage,
  type PongMessage,
  type ErrorMessage,
  type Message,
  // Tool types
  type ToolName,
  type DisabledToolName,
  type InternalToolName,
  type AllToolName,
  type ToolSchema,
  type ToolResultContent,
  type ToolResult,
  type Tool,
  type ToolHandlerOptions,
  type ExtensionCaller,
  type ExtensionCallerResponse,
  type TabIdTracker,
} from './types/index.js';

// ============================================================================
// Tools - schemas, handlers, factories
// ============================================================================

export {
  // Zod schemas for validation
  ClickSchema,
  TypeSchema,
  DragSchema,
  NavigateSchema,
  ScrollSchema,
  SnapshotSchema,
  ScreenshotSchema,
  // Tool definitions
  TOOL_DEFINITIONS,
  getToolSchema,
  getToolSchemas,
  getAllToolSchemas,
  TOOL_SCHEMAS,
  // Handlers
  type ExtensionResponse,
  toToolResult,
  toErrorResult,
  // Factories
  createBrowserClick,
  createBrowserType,
  createBrowserDrag,
  createBrowserNavigate,
  createBrowserScroll,
  createBrowserSnapshot,
  createBrowserScreenshot,
  createAllTools,
} from './tools/index.js';

// ============================================================================
// Utils - sanitization, validation
// ============================================================================

export {
  sanitizeClickParams,
  sanitizeTypeParams,
  sanitizeInputParams,
  sanitizeDragParams,
  sanitizeNavigateParams,
  sanitizeScrollParams,
  sanitizeSnapshotParams,
  sanitizeScreenshotParams,
} from './utils/index.js';

// ============================================================================
// Constants - shared configuration values
// ============================================================================

export {
  DEFAULT_TOOL_TIMEOUT_MS,
  SCREENSHOT_TIMEOUT_MS,
} from './constants.js';
