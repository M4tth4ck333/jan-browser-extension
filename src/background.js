// background.js
// Minimal service worker for the Jan browser MCP extension.

import {
  MessageTypes,
} from './constants.js';
import { initializeMcpBridge, getBridgeStatus, closeBridge } from './mcp-bridge.js';
import {
  clearMcpRegisteredTab,
  getMcpRegisteredTab,
  setMcpRegisteredTab,
} from './lib/tab-manager.js';
import {
  performDuckDuckGoSearchAndScrape,
  performGoogleSearchAndScrape,
} from './search/index.js';

// -----------------------------------------------------------------------------
// Browser API shim (kept for Chromium/Firefox compatibility)
// -----------------------------------------------------------------------------
try {
  if (typeof window !== 'undefined' && !window.browser && window.chrome) {
    window.browser = window.chrome;
  }
} catch (_) {}

try {
  if (typeof globalThis !== 'undefined' && !globalThis.browser && globalThis.chrome) {
    globalThis.browser = globalThis.chrome;
  }
} catch (_) {}

// -----------------------------------------------------------------------------
// MCP bridge bootstrapping
// -----------------------------------------------------------------------------
initializeMcpBridge({
  searchFunctions: {
    performDuckDuckGoSearchAndScrape,
    performGoogleSearchAndScrape,
  },
});

// -----------------------------------------------------------------------------
// Tab lifecycle
// -----------------------------------------------------------------------------
chrome.tabs.onRemoved.addListener((tabId) => {
  const registeredTabId = getMcpRegisteredTab();
  if (registeredTabId === tabId) {
    clearMcpRegisteredTab();
    try {
      console.log('[BG] MCP registered tab closed, cleared registration:', tabId);
    } catch (_) {}
  }
});

// -----------------------------------------------------------------------------
// Runtime messaging (only MCP-related messages are supported)
// -----------------------------------------------------------------------------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case MessageTypes.GET_BRIDGE_STATUS: {
      sendResponse(getBridgeStatus());
      return true;
    }

    case MessageTypes.RECONNECT_BRIDGE: {
      try {
        closeBridge();
        sendResponse({ ok: true });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    case MessageTypes.MCP_REGISTER_TAB: {
      const tabId = message?.payload?.tabId;
      if (typeof tabId === 'number') {
        setMcpRegisteredTab(tabId);
        sendResponse({ ok: true, tabId });
      } else if (tabId === null) {
        clearMcpRegisteredTab();
        sendResponse({ ok: true, tabId: null });
      } else {
        sendResponse({ ok: false, error: 'Missing tabId' });
      }
      return true;
    }

    case MessageTypes.MCP_GET_REGISTERED_TAB: {
      sendResponse({ ok: true, tabId: getMcpRegisteredTab() });
      return true;
    }

    case MessageTypes.MCP_FOCUS_REGISTERED_TAB: {
      const tabId = getMcpRegisteredTab();
      if (typeof tabId !== 'number') {
        sendResponse({ ok: false, error: 'No registered tab' });
        return true;
      }

      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          clearMcpRegisteredTab();
          sendResponse({ ok: false, error: 'Registered tab is no longer available' });
          return;
        }

        chrome.tabs.update(tabId, { active: true }, () => {
          if (chrome.runtime.lastError) {
            sendResponse({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }

          chrome.windows.update(tab.windowId, { focused: true }, () => {
            if (chrome.runtime.lastError) {
              // Focusing the window can fail if permissions are missing or window was closed.
              sendResponse({ ok: false, error: chrome.runtime.lastError.message });
              return;
            }

            sendResponse({ ok: true, tabId });
          });
        });
      });

      return true;
    }

    default:
      return false;
  }
});
