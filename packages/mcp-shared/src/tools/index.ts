/**
 * Tools module
 * Contains tool schemas, handlers, and factory functions
 */

// ============================================================================
// Types (re-exported from types folder)
// ============================================================================

export type {
  ToolName,
  DisabledToolName,
  InternalToolName,
  AllToolName,
  ToolSchema,
  ToolResultContent,
  ToolResult,
  Tool,
  ToolHandlerOptions,
  ExtensionCaller,
  ExtensionCallerResponse,
  TabIdTracker,
} from '../types/index.js';

// ============================================================================
// Schemas
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
  // Tool definitions with descriptions
  TOOL_DEFINITIONS,
  // Schema getters
  getToolSchema,
  getToolSchemas,
  getAllToolSchemas,
  TOOL_SCHEMAS,
} from './schemas.js';

// ============================================================================
// Handlers
// ============================================================================

export {
  type ExtensionResponse,
  toToolResult,
  toErrorResult,
} from './handlers.js';

// ============================================================================
// Tool Factories
// ============================================================================

export { createBrowserClick, createBrowserType, createBrowserDrag } from './automation.js';
export { createBrowserNavigate, createBrowserScroll } from './navigation.js';
export { createBrowserSnapshot, createBrowserScreenshot } from './observation.js';

import type { Tool, ToolHandlerOptions } from '../types/index.js';
import { createBrowserClick, createBrowserType, createBrowserDrag } from './automation.js';
import { createBrowserNavigate, createBrowserScroll } from './navigation.js';
import { createBrowserSnapshot, createBrowserScreenshot } from './observation.js';

/**
 * Create all standard tools with the given options
 */
export function createAllTools(options: ToolHandlerOptions): Tool[] {
  return [
    // Automation
    createBrowserClick(options),
    createBrowserType(options),
    // createBrowserDrag(options), // Drag available but hidden from tool list

    // Navigation
    createBrowserNavigate(options),
    createBrowserScroll(options),

    // Observation
    createBrowserSnapshot(options),
    createBrowserScreenshot(options),
  ];
}
