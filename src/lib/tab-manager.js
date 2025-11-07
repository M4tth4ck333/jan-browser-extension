// tab-manager.js
// Centralized tab selection and management for MCP tools

/**
 * Registered tab ID for agentic workflows (like browsermcp)
 * This is set by the visit/navigate tool and used by screenshot/snapshot/automation tools
 */
export let mcpRegisteredTabId = null;

/**
 * Sets the registered tab ID for MCP operations
 * @param {number|null} tabId - Tab ID to register, or null to clear
 */
export function setMcpRegisteredTab(tabId) {
  mcpRegisteredTabId = tabId;
  if (tabId) {
    try {
      console.log('[Tab Manager] Registered tab:', tabId);
    } catch (_) {}
  }
}

/**
 * Gets the registered tab ID
 * @returns {number|null} Current registered tab ID or null
 */
export function getMcpRegisteredTab() {
  return mcpRegisteredTabId;
}

/**
 * Clears the registered tab ID
 */
export function clearMcpRegisteredTab() {
  mcpRegisteredTabId = null;
  try {
    console.log('[Tab Manager] Cleared registered tab');
  } catch (_) {}
}

/**
 * Selects a tab using the standard strategy:
 * 1. Try registered tab (if valid)
 * 2. Fall back to currently active tab
 * 3. Return error if no tab available
 *
 * @param {object} options - Options for tab selection
 * @param {boolean} options.requireUrl - If true, reject chrome:// and about: URLs
 * @param {string} options.toolName - Name of tool for error messages
 * @returns {Promise<{ok: boolean, tab?: object, tabId?: number, error?: string}>}
 */
export async function selectTab(options = {}) {
  const { requireUrl = false, toolName = 'tool' } = options;

  let targetTabId = null;
  let tab = null;

  // Strategy 1: Use registered tab if available
  if (mcpRegisteredTabId) {
    try {
      console.log(`[Tab Manager] ${toolName} - trying registered tab:`, mcpRegisteredTabId);
      tab = await chrome.tabs.get(mcpRegisteredTabId);
      targetTabId = mcpRegisteredTabId;
      console.log(`[Tab Manager] ${toolName} - using registered tab:`, targetTabId);
    } catch (e) {
      // Tab was closed, clear registration
      mcpRegisteredTabId = null;
      console.log(`[Tab Manager] Registered tab no longer exists, falling back to active tab`);
    }
  }

  // Strategy 2: Fall back to currently active tab
  if (!targetTabId) {
    console.log(`[Tab Manager] ${toolName} - querying for active tab`);
    // Use lastFocusedWindow instead of currentWindow
    // Service workers have no concept of "current window"
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!activeTab) {
      console.log(`[Tab Manager] ${toolName} - no active tab found`);
      return {
        ok: false,
        error: 'No active tab. First navigate with visit(url="...", closeTab=false), or focus a tab manually.'
      };
    }
    tab = activeTab;
    targetTabId = activeTab.id;
    console.log(`[Tab Manager] ${toolName} - using active tab:`, targetTabId, 'window:', tab.windowId);
  }

  // Validate URL if required
  if (requireUrl) {
    if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('about:')) {
      console.log(`[Tab Manager] ${toolName} - invalid URL:`, tab.url);
      return {
        ok: false,
        error: 'Cannot operate on chrome:// or about: pages'
      };
    }
  }

  return {
    ok: true,
    tab,
    tabId: targetTabId
  };
}

/**
 * Gets the currently active tab
 * @returns {Promise<chrome.tabs.Tab|null>} Active tab or null if none found
 */
export async function getActiveTab() {
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return activeTab || null;
}

/**
 * Checks if a tab ID is valid and exists
 * @param {number} tabId - Tab ID to check
 * @returns {Promise<boolean>} True if tab exists
 */
export async function isTabValid(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Validates that a tab's window exists and is in a valid state
 * @param {number} windowId - Window ID to check
 * @returns {Promise<{ok: boolean, windowInfo?: object, error?: string}>}
 */
export async function validateWindow(windowId) {
  let windowInfo;
  try {
    windowInfo = await chrome.windows.get(windowId);
  } catch (e) {
    console.error('[Tab Manager] Failed to get window info:', e);
    return {
      ok: false,
      error: 'Tab window no longer exists'
    };
  }

  // Check if window is minimized
  if (windowInfo.state === 'minimized') {
    console.log('[Tab Manager] Window is minimized, cannot capture');
    return {
      ok: false,
      error: 'Cannot operate on minimized window. Please restore the window.'
    };
  }

  return {
    ok: true,
    windowInfo
  };
}

/**
 * Creates a new tab with the given URL
 * @param {string} url - URL to open
 * @param {boolean} active - Whether to make the tab active
 * @returns {Promise<chrome.tabs.Tab>} Created tab
 */
export async function createTab(url, active = true) {
  const tab = await chrome.tabs.create({ url, active });
  console.log('[Tab Manager] Created tab:', tab.id, 'url:', url);
  return tab;
}

/**
 * Closes a tab by ID
 * @param {number} tabId - Tab ID to close
 * @returns {Promise<void>}
 */
export async function closeTab(tabId) {
  try {
    await chrome.tabs.remove(tabId);
    console.log('[Tab Manager] Closed tab:', tabId);
    // Clear registered tab if it matches
    if (mcpRegisteredTabId === tabId) {
      mcpRegisteredTabId = null;
    }
  } catch (e) {
    console.warn('[Tab Manager] Failed to close tab:', tabId, e);
  }
}

/**
 * Updates a tab's properties
 * @param {number} tabId - Tab ID to update
 * @param {object} updateProperties - Properties to update
 * @returns {Promise<chrome.tabs.Tab>} Updated tab
 */
export async function updateTab(tabId, updateProperties) {
  return await chrome.tabs.update(tabId, updateProperties);
}
