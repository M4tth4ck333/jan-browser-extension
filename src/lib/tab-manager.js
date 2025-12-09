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

function getSafeCreateUrl(preferredUrl) {
  if (!preferredUrl) return null;

  try {
    const parsed = new URL(preferredUrl);
    const protocol = parsed.protocol.toLowerCase();

    // Only allow navigable URLs we expect to use
    if (protocol === 'http:' || protocol === 'https:' || protocol === 'about:') {
      return parsed.toString();
    }
  } catch (_) {
    // Ignore invalid URLs
  }

  return null;
}

/**
 * Selects a tab for MCP operations. The default behavior is:
 * 1) Use the registered MCP tab if available
 * 2) Otherwise create a new background tab (if allowed)
 * 3) Only fall back to the user's active tab when explicitly allowed
 */
export async function selectTab(options = {}) {
  const {
    requireUrl = false,
    toolName = 'tool',
    preferredUrl = null,
    allowCreate = true,
    allowActiveTab = false,
    allowExistingMatchingTab = false,
  } = options;

  let targetTabId = null;
  let tab = null;
  let createdNewTab = false;

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
      console.log('[Tab Manager] Registered tab no longer exists, clearing registration');
    }
  }

  // Optional: explicitly allow using the user's active tab
  if (!targetTabId && allowActiveTab) {
    console.log(`[Tab Manager] ${toolName} - querying for active tab (explicitly allowed)`);
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab) {
      tab = activeTab;
      targetTabId = activeTab.id;
      console.log(`[Tab Manager] ${toolName} - using active tab:`, targetTabId, 'window:', tab.windowId);
    }
  }

  // Optional: reuse an existing tab that matches a preferred URL (opt-in)
  if (!targetTabId && allowExistingMatchingTab && preferredUrl) {
    const safePreferred = getSafeCreateUrl(preferredUrl);
    if (safePreferred) {
      try {
        const tabs = await chrome.tabs.query({});
        const matchingTab = tabs.find((candidate) => candidate?.url === safePreferred);
        if (matchingTab) {
          tab = matchingTab;
          targetTabId = matchingTab.id;
          console.log(`[Tab Manager] ${toolName} - using matching tab for preferred URL:`, targetTabId);
        }
      } catch (error) {
        console.warn('[Tab Manager] Failed to query tabs while matching preferred URL:', error);
      }
    }
  }

  // Default: create a dedicated background tab for MCP if none is registered/selected
  if (!targetTabId) {
    if (!allowCreate) {
      return {
        ok: false,
        error: 'No MCP tab is registered. Assign a tab from the extension popup or run a navigation tool to create one.',
      };
    }

    const createUrl = getSafeCreateUrl(preferredUrl) || 'about:blank';
    console.log(`[Tab Manager] ${toolName} - creating dedicated MCP tab`, { url: createUrl });

    try {
      tab = await chrome.tabs.create({ url: createUrl, active: false });
      targetTabId = tab.id;
      createdNewTab = true;
      console.log(`[Tab Manager] ${toolName} - created new MCP tab:`, targetTabId);
    } catch (error) {
      console.error('[Tab Manager] Failed to create MCP tab:', error);
      return {
        ok: false,
        error: 'Unable to create a browser tab for MCP operations. Please open a tab manually and try again.'
      };
    }
  }

  // Validate URL if required
  if (requireUrl) {
    const url = tab.url || '';
    const normalized = url.toLowerCase();
    if (
      !url ||
      normalized.startsWith('chrome://') ||
      normalized.startsWith('chrome-extension://') ||
      normalized.startsWith('edge://') ||
      (normalized.startsWith('about:') && normalized !== 'about:blank')
    ) {
      console.log(`[Tab Manager] ${toolName} - invalid URL:`, tab.url);
      return {
        ok: false,
        error: 'Cannot operate on browser-internal pages. Please navigate to a regular website first.'
      };
    }
  }

  if ((createdNewTab || !mcpRegisteredTabId) && typeof targetTabId === 'number') {
    setMcpRegisteredTab(targetTabId);
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
