// index.js
// MCP Tools registry and dispatcher

import {
  handleClickElement,
  handleFillForm,
  handleTypeText,
  handleHoverElement,
  handleSelectOption,
  handlePressKey,
  handleDragElement
} from './automation.js';

import {
  handleVisit,
  handleGoBack,
  handleGoForward,
  handleScroll
} from './navigation.js';

import {
  handleScreenshot,
  handleSnapshot
} from './observation.js';

import { handleSearch } from './search.js';

/**
 * MCP Tools Registry
 * Maps tool names to their handler functions
 */
export const mcpToolHandlers = {
  // Automation tools
  click_element: handleClickElement,
  fill_form: handleFillForm,
  type_text: handleTypeText,
  hover_element: handleHoverElement,
  select_option: handleSelectOption,
  press_key: handlePressKey,
  drag_element: handleDragElement,

  // Navigation tools
  visit: handleVisit,
  go_back: handleGoBack,
  go_forward: handleGoForward,
  scroll_page: handleScroll,

  // Observation tools
  screenshot: handleScreenshot,
  snapshot: handleSnapshot,

  // Search tool (requires external dependencies)
  search: handleSearch,

};

/**
 * Dispatches a tool call to the appropriate handler
 *
 * @param {string} toolName - Name of the tool to invoke
 * @param {object} params - Parameters for the tool
 * @param {object} context - Additional context (e.g., search functions for the search tool)
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
    // For search tool, pass search functions from context
    if (toolName === 'search' && context.searchFunctions) {
      return await handler(params, context.searchFunctions);
    }

    // For all other tools, just pass params
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
