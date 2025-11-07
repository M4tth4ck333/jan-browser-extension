// background.js (MV3 service worker / Firefox background script)
// Refactored: Most logic extracted to modules for maintainability

// ============================================================================
// Imports
// ============================================================================

import {
  GLOBAL_KEY,
  MessageTypes,
  Commands,
  ContextMenuIds,
  isSupportedUrl
} from './constants.js';

import {
  sidepanelPorts,
  streamingControllers,
  registerPort,
  unregisterPortInstance,
  abortStream,
  registerStreamController
} from './lib/event-routing.js';

import { initializeMcpBridge, getBridgeStatus, closeBridge } from './mcp-bridge.js';

import { streamChatCompletion } from './streaming/index.js';

import { performGoogleSearchAndScrape, performDuckDuckGoSearchAndScrape } from './search/index.js';

import { loadConfig, getSettings, testSettings, pingModels, chatCompletions } from './settings.js';

import { buildInlineAssistMessages, handleSummarize } from './prompts.js';

// ============================================================================
// Browser API Shim (cross-browser compatibility)
// ============================================================================

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

// ============================================================================
// Port Management
// ============================================================================

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'jan-stream') return;

  // Store a global reference so we can still stream even if tab association is missing
  registerPort(GLOBAL_KEY, port);
  const initialTabId = port.sender?.tab?.id;
  if (initialTabId) registerPort(initialTabId, port);

  try {
    console.log('[BG] port connected', { initialTabId });
  } catch (_) {}

  // Allow the side panel to register/update its tabId explicitly
  try {
    port.onMessage.addListener((msg) => {
      // [JAN-BEHAVIOR:PORT-REGISTER] side panel port registration and routing map
      if (msg && msg.type === MessageTypes.REGISTER_PORT && msg.tabId) {
        registerPort(msg.tabId, port);
        try {
          console.log('[BG] REGISTER_PORT', { tabId: msg.tabId });
        } catch (_) {}
      }
    });
  } catch (_) {
    /* ignore */
  }

  port.onDisconnect.addListener(() => {
    unregisterPortInstance(port);
  });
});

// ============================================================================
// Side Panel Setup
// ============================================================================

// Prefer Chrome auto-opening the side panel on action click for reliability.
try {
  chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
} catch (err) {
  console.warn('setPanelBehavior (startup) not supported:', err);
}

// ============================================================================
// MCP Bridge Initialization
// ============================================================================

// Initialize MCP bridge with context (search functions)
initializeMcpBridge({
  searchFunctions: {
    performDuckDuckGoSearchAndScrape,
    performGoogleSearchAndScrape
  }
});

// ============================================================================
// Extension Lifecycle Events
// ============================================================================

chrome.runtime.onInstalled.addListener(async () => {
  // Load config first
  const config = await loadConfig();

  // Initialize defaults without clobbering user settings
  const stored = await chrome.storage.sync.get(null);
  const toSet = {};
  for (const key of Object.keys(config)) {
    if (!(key in stored)) {
      toSet[key] = config[key];
    }
  }
  if (Object.keys(toSet).length > 0) {
    await chrome.storage.sync.set(toSet);
    console.log('[BG] Initialized default settings:', Object.keys(toSet));
  }

  // Set up side panel behavior
  try {
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior not supported:', err);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  try {
    await chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });
  } catch (err) {
    console.warn('setPanelBehavior (startup) not supported:', err);
  }
});

// ============================================================================
// Action Click Handler
// ============================================================================

chrome.action.onClicked.addListener(async (tab) => {
  // [JAN-BEHAVIOR:SIDEPANEL-OPEN] action click opens sidepanel
  try {
    const tabId = tab?.id;
    // If current tab doesn't support side panel (e.g., chrome://), try to find one that does
    if (tabId && isSupportedUrl(tab.url)) {
      await chrome.sidePanel.open({ tabId });
    } else {
      // Fallback: find any tab with a supported URL
      const tabs = await chrome.tabs.query({});
      const supportedTab = tabs.find(t => isSupportedUrl(t.url));
      if (supportedTab) {
        await chrome.sidePanel.open({ tabId: supportedTab.id });
        await chrome.tabs.update(supportedTab.id, { active: true });
      } else {
        // Last resort: create a new tab
        const newTab = await chrome.tabs.create({ url: 'https://jan.ai' });
        await chrome.sidePanel.open({ tabId: newTab.id });
      }
    }
  } catch (err) {
    console.warn('[BG] Failed to open side panel:', err);
    // Fallback for browsers that don't support sidePanel.open
    try {
      await chrome.sidePanel.setOptions({
        enabled: true,
        path: 'ui/sidepanel/index.html'
      });
    } catch (e2) {
      console.error('[BG] All side panel methods failed:', e2);
    }
  }
});

// ============================================================================
// Keyboard Commands
// ============================================================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command === Commands.OPEN_SIDEPANEL) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.sidePanel.open({ tabId: tab.id });
      } catch (err) {
        console.warn('Failed to open side panel:', err);
      }
    }
  } else if (command === Commands.OPEN_CUSTOM_PROMPT) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && isSupportedUrl(tab.url)) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'SHOW_CUSTOM_PROMPT' });
      } catch (err) {
        console.warn('Failed to show custom prompt:', err);
      }
    }
  } else if (command === Commands.TOGGLE_AUTOCOMPLETE) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && isSupportedUrl(tab.url)) {
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_AUTOCOMPLETE' });
      } catch (err) {
        console.warn('Failed to toggle autocomplete:', err);
      }
    }
  }
});

// ============================================================================
// Context Menu
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: ContextMenuIds.ADD_TO_CONTEXT,
    title: 'Add to Jan context',
    contexts: ['page', 'selection', 'link']
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === ContextMenuIds.ADD_TO_CONTEXT && tab?.id) {
    // Forward to side panel
    const port = sidepanelPorts.get(tab.id) || sidepanelPorts.get(GLOBAL_KEY);
    if (port) {
      try {
        port.postMessage({
          type: 'ADD_TAB_TO_CONTEXT',
          tabId: tab.id,
          title: tab.title,
          url: tab.url
        });
      } catch (err) {
        console.warn('Failed to send context menu message:', err);
      }
    }
  }
});

// ============================================================================
// Runtime Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle SUMMARIZE
  if (message?.type === MessageTypes.SUMMARIZE) {
    (async () => {
      try {
        const result = await handleSummarize(message.payload);
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle INLINE_ASSIST_START
  if (message?.type === MessageTypes.INLINE_ASSIST_START) {
    (async () => {
      try {
        const { mode, text, lang } = message.payload || {};
        const { system, user } = buildInlineAssistMessages({ mode, text, lang });
        const { apiBase, apiKey, useApiKey, model, temperature } = await getSettings();

        const response = await chatCompletions({
          apiBase,
          apiKey,
          useApiKey,
          model,
          temperature,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user }
          ]
        });

        if (!response.ok) {
          sendResponse(response);
        } else {
          const revised = response.data?.choices?.[0]?.message?.content || response.data?.choices?.[0]?.text || text;
          sendResponse({ ok: true, revised });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle CUSTOM_PROMPT_RUN
  if (message?.type === 'CUSTOM_PROMPT_RUN') {
    (async () => {
      try {
        const { prompt, selection } = message.payload || {};
        const { apiBase, apiKey, useApiKey, model, temperature } = await getSettings();

        const response = await chatCompletions({
          apiBase,
          apiKey,
          useApiKey,
          model,
          temperature,
          messages: [
            { role: 'user', content: `${prompt}\n\nSelected text:\n${selection}` }
          ]
        });

        sendResponse(response);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle TEST_SETTINGS
  if (message?.type === MessageTypes.TEST_SETTINGS) {
    (async () => {
      const result = await testSettings();
      sendResponse(result);
    })();
    return true;
  }

  // Handle LIST_MODELS
  if (message?.type === MessageTypes.LIST_MODELS) {
    (async () => {
      try {
        const { apiBase, apiKey, useApiKey } = await getSettings();
        const result = await pingModels({ apiBase, apiKey, useApiKey });
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle CHAT_COMPLETION (non-streaming)
  if (message?.type === MessageTypes.CHAT_COMPLETION) {
    (async () => {
      try {
        const { messages, temperature } = message.payload || {};
        const { apiBase, apiKey, useApiKey, model } = await getSettings();

        const response = await chatCompletions({
          apiBase,
          apiKey,
          useApiKey,
          model,
          temperature: temperature ?? 0.7,
          messages
        });

        sendResponse(response);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle AUTOCOMPLETE_SUGGEST
  if (message?.type === 'AUTOCOMPLETE_SUGGEST') {
    (async () => {
      try {
        const { prefix } = message.payload || {};
        const { apiBase, apiKey, useApiKey, model } = await getSettings();

        const pref = String(prefix || '').slice(-1000);
        const response = await chatCompletions({
          apiBase,
          apiKey,
          useApiKey,
          model,
          temperature: 0.3,
          messages: [
            {
              role: 'system',
              content: 'You are a next-word autocomplete assistant. Given a text prefix, predict the next 1-5 words. Return ONLY the continuation, no quotes or explanations.'
            },
            { role: 'user', content: pref }
          ]
        });

        if (!response.ok) {
          sendResponse(response);
        } else {
          const suggestion = response.data?.choices?.[0]?.message?.content || response.data?.choices?.[0]?.text || '';
          sendResponse({ ok: true, suggestion: suggestion.trim() });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle CHAT_COMPLETION_STREAM_START
  if (message?.type === MessageTypes.CHAT_COMPLETION_STREAM_START) {
    (async () => {
      try {
        const { messages, temperature, reqId } = message.payload || {};
        const tabId = sender.tab?.id || null;

        if (!reqId) {
          sendResponse({ ok: false, error: 'Missing reqId' });
          return;
        }

        const { apiBase, apiKey, useApiKey, model } = await getSettings();

        // Start streaming (non-blocking)
        streamChatCompletion(
          { apiBase, apiKey, useApiKey, model, temperature: temperature ?? 0.7, messages },
          tabId,
          reqId,
          getSettings
        );

        sendResponse({ ok: true, reqId });
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle CHAT_COMPLETION_STREAM_STOP
  if (message?.type === MessageTypes.CHAT_COMPLETION_STREAM_STOP) {
    // [JAN-BEHAVIOR:STREAM-STOP] UI cancel routed to abort controller
    try {
      const { reqId } = message.payload || {};
      if (reqId) {
        const aborted = abortStream(reqId);
        sendResponse({ ok: true, aborted });
      } else {
        sendResponse({ ok: false, error: 'Missing reqId' });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  // Handle GOOGLE_SEARCH_AND_SCRAPE
  if (message?.type === 'GOOGLE_SEARCH_AND_SCRAPE') {
    (async () => {
      try {
        const result = await performGoogleSearchAndScrape(message.payload);
        sendResponse(result);
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle SEARCH_AND_SCRAPE (unified search with DDG first, Google fallback)
  if (message?.type === MessageTypes.SEARCH_AND_SCRAPE) {
    (async () => {
      try {
        const { query, numResults = 5, debug = false, readinessTimeoutMs = 15000, closeTab = true } = message?.payload || {};

        // Try DuckDuckGo first
        const ddgRes = await performDuckDuckGoSearchAndScrape({ query, numResults, closeTab: true, debug });
        const dCount = (ddgRes?.ok && ddgRes?.data && Array.isArray(ddgRes.data.results)) ? ddgRes.data.results.length : 0;

        if (ddgRes?.ok && ddgRes?.data && dCount > 0) {
          sendResponse({ ok: true, data: ddgRes.data, source: 'duckduckgo' });
          return;
        }

        // Fallback to Google
        const googleRes = await performGoogleSearchAndScrape({ query, numResults, closeTab, debug, readinessTimeoutMs });
        if (googleRes?.ok) {
          sendResponse({ ok: true, data: googleRes.data, source: 'google' });
        } else {
          sendResponse({ ok: false, error: 'Both DuckDuckGo and Google search failed' });
        }
      } catch (e) {
        sendResponse({ ok: false, error: String(e?.message || e) });
      }
    })();
    return true;
  }

  // Handle GET_BRIDGE_STATUS
  if (message?.type === MessageTypes.GET_BRIDGE_STATUS) {
    const status = getBridgeStatus();
    sendResponse(status);
    return true;
  }

  // Handle RECONNECT_BRIDGE
  if (message?.type === 'RECONNECT_BRIDGE') {
    try {
      closeBridge();
      // Bridge will auto-reconnect via close handler
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  // Handle SELECTION_UPDATED (forward to side panel)
  if (message?.type === 'SELECTION_UPDATED') {
    try {
      const tabId = sender.tab?.id;
      const port = tabId ? sidepanelPorts.get(tabId) : null;
      const globalPort = sidepanelPorts.get(GLOBAL_KEY);
      const targetPort = port || globalPort;

      if (targetPort) {
        targetPort.postMessage(message);
      }
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }

  return false;
});
