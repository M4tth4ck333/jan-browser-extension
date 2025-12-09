/**
 * Shared types for MCP packages
 */

// Messages - communication protocol
export {
  type MessageKind,
  type ToolCallRequest,
  type ToolCallResponse,
  type HelloMessage,
  type PingMessage,
  type PongMessage,
  type ErrorMessage,
  type Message,
} from './messages.js';

// Tools - types, schemas, handlers
export {
  type ToolName,
  type DisabledToolName,
  type InternalToolName,
  type AllToolName,
  type ToolSchema,
  type ToolResultContent,
  type ToolResult,
  type ExtensionCallerResponse,
  type ExtensionCaller,
  type TabIdTracker,
  type Tool,
  type ToolHandlerOptions,
} from './tools.js';
