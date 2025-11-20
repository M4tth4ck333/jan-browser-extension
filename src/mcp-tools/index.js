// index.js
// MCP Tools registry and dispatcher

import {
  handleClickElement,
  handleTypeText,
  handleInputValue,
  handleDragElement,
  handleBrowserRef,
} from './automation.js';

import {
  handleNavigate,
  handleScroll
} from './navigation.js';

import {
  handleScreenshot,
  handleBrowserSnapshotYaml,
  handleGetUrl,
  handleGetTitle,
} from './observation.js';

/**
 * MCP Tools Registry
 * Maps tool names to their handler functions
 */
export const mcpToolHandlers = {
  // Automation tools
  browser_click: handleClickElement,
  browser_type: handleTypeText,
  browser_input: handleInputValue,
  browser_drag: handleDragElement,
  browser_ref: handleBrowserRef,

  // Navigation tools
  browser_navigate: handleNavigate,
  browser_scroll: handleScroll,

  // Observation tools
  browser_screenshot: handleScreenshot,
  browser_snapshot: handleBrowserSnapshotYaml,
  browser_get_url: handleGetUrl,
  browser_get_title: handleGetTitle,

};

/**
 * Dispatches a tool call to the appropriate handler
 *
 * @param {string} toolName - Name of the tool to invoke
 * @param {object} params - Parameters for the tool
 * @param {object} context - Additional context (reserved for future use)
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function dispatchToolCall(toolName, params = {}, context = {}) {
  const handler = mcpToolHandlers[toolName];

  if (!handler) {
    return {
      ok: false,
      error: `Unknown tool: ${toolName}. Available tools: ${Object.keys(mcpToolHandlers).join(', ')}`
    };
  }

  try {
    return await handler(params);
  } catch (error) {
    console.error(`[MCP Tools] Error in ${toolName}:`, error);
    return {
      ok: false,
      error: String(error?.message || error)
    };
  }
}

/**
 * Gets a list of all available tools
 * @returns {string[]} Array of tool names
 */
export function getAvailableTools() {
  return Object.keys(mcpToolHandlers);
}

/**
 * Checks if a tool is registered
 * @param {string} toolName - Tool name to check
 * @returns {boolean} True if tool exists
 */
export function isToolAvailable(toolName) {
  return toolName in mcpToolHandlers;
}
