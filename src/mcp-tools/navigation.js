// navigation.js
// MCP Bridge navigation tools: visit, go_back, go_forward, scroll

import { selectTab, setMcpRegisteredTab, getMcpRegisteredTab } from '../lib/tab-manager.js';
import { sendMessageWithRetry } from '../lib/fetch-utils.js';
import { CONTENT_LOAD_TIMEOUT, TAB_REGISTRATION_DELAY, VisitOutputModes } from '../constants.js';

/**
 * Visits a URL and extracts page content
 * If no tab is registered, creates and registers a new tab
 * If a tab is already registered, navigates that tab to the new URL
 */
export async function handleVisit(params) {
  const url = String(params?.url || '').trim();
  if (!url) {
    return { ok: false, error: 'Missing url parameter' };
  }

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    return { ok: false, error: `Invalid URL: ${url}` };
  }

  const mode = params?.mode || VisitOutputModes.MARKDOWN;
  const maxContentLength = Number(params?.maxContentLength) || 100000;
  const closeTab = params?.closeTab === true;  // Default: false (keep tabs open)

  console.log('[MCP Tools] visit', { url, mode, maxContentLength, closeTab });

  try {
    let tabId;
    let isNewTab = false;

    // Check if we have a registered tab
    const registeredTabId = getMcpRegisteredTab();

    if (registeredTabId) {
      // Try to use the existing registered tab
      try {
        await chrome.tabs.get(registeredTabId);
        console.log('[MCP Tools] Using existing registered tab:', registeredTabId);

        // Navigate the existing tab to the new URL
        await chrome.tabs.update(registeredTabId, { url, active: false });
        tabId = registeredTabId;
      } catch (e) {
        // Registered tab no longer exists, create a new one
        console.log('[MCP Tools] Registered tab no longer exists, creating new tab');
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;
        isNewTab = true;
      }
    } else {
      // No registered tab, create a new one
      console.log('[MCP Tools] No registered tab, creating new tab');
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;
      isNewTab = true;
    }

    // Wait for the page to load
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Page load timeout'));
      }, CONTENT_LOAD_TIMEOUT);

      const listener = (changedTabId, changeInfo) => {
        if (changedTabId === tabId && changeInfo.status === 'complete') {
          clearTimeout(timeout);
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });

    // Extract page content
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' });

    if (!response || !response.ok) {
      await chrome.tabs.remove(tabId);
      return { ok: false, error: 'Failed to extract page content' };
    }

    // Build response based on requested mode
    const result = {
      url: response.url || url,
      title: response.title || '',
      lang: response.lang || '',
      metaDescription: response.metaDescription || '',
      tabId: tabId  // Include tab ID for session management
    };

    if (mode === VisitOutputModes.HTML) {
      // Get the full HTML
      try {
        const [{ result: html }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => document.documentElement.outerHTML
        });
        result.html = String(html || '').slice(0, maxContentLength);
      } catch (e) {
        result.html = '';
      }
    } else if (mode === VisitOutputModes.TEXT) {
      result.text = String(response.content || '').slice(0, maxContentLength);
    } else {
      // markdown mode (default)
      result.markdown = String(response.content || '').slice(0, maxContentLength);
    }

    // By default, keep tabs open for agentic workflows
    // Only close if explicitly requested
    if (closeTab) {
      await chrome.tabs.remove(tabId);
      console.log('[MCP Tools] Tab closed as requested');
    } else {
      // Register tab if it's a new tab (only register once, not on every visit)
      if (isNewTab) {
        setMcpRegisteredTab(tabId);
        console.log('[MCP Tools] Registered new tab:', tabId);
      } else {
        console.log('[MCP Tools] Navigated existing registered tab:', tabId);
      }

      // Focus the tab's window first, then activate the tab
      const currentTab = await chrome.tabs.get(tabId);
      await chrome.windows.update(currentTab.windowId, { focused: true });
      await chrome.tabs.update(tabId, { active: true });
      console.log('[MCP Tools] Tab is now active and visible in focused window');
    }

    console.log('[MCP Tools] visit result', {
      url: result.url,
      title: result.title,
      contentLength: result.markdown?.length || result.text?.length || result.html?.length || 0,
      closeTab: closeTab,
      tabId: tabId
    });

    return { ok: true, data: result };
  } catch (e) {
    console.error('[MCP Tools] visit error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Goes back in browser history
 */
export async function handleGoBack(params) {
  try {
    const selection = await selectTab({ toolName: 'go_back' });
    if (!selection.ok) return selection;

    const { tabId } = selection;

    await chrome.tabs.goBack(tabId);
    await new Promise(resolve => setTimeout(resolve, TAB_REGISTRATION_DELAY));

    const finalTab = await chrome.tabs.get(tabId);

    return { ok: true, data: { url: finalTab.url } };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Goes forward in browser history
 */
export async function handleGoForward(params) {
  try {
    const selection = await selectTab({ toolName: 'go_forward' });
    if (!selection.ok) return selection;

    const { tabId } = selection;

    await chrome.tabs.goForward(tabId);
    await new Promise(resolve => setTimeout(resolve, TAB_REGISTRATION_DELAY));

    const finalTab = await chrome.tabs.get(tabId);

    return { ok: true, data: { url: finalTab.url } };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Scrolls the page
 */
export async function handleScroll(params) {
  const direction = String(params?.direction || 'down');
  const amount = Number(params?.amount) || 500;

  try {
    const selection = await selectTab({ toolName: 'scroll_page' });
    if (!selection.ok) return selection;

    const { tabId, tab } = selection;

    await chrome.scripting.executeScript({
      target: { tabId },
      func: (dir, amt) => {
        if (dir === 'top') window.scrollTo(0, 0);
        else if (dir === 'bottom') window.scrollTo(0, document.body.scrollHeight);
        else if (dir === 'up') window.scrollBy(0, -amt);
        else window.scrollBy(0, amt);
      },
      args: [direction, amount]
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    return { ok: true, data: { url: tab.url, direction, amount } };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
