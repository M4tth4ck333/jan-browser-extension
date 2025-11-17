// observation.js
// MCP Bridge observation tools: screenshot, snapshot

import { selectTab, validateWindow } from '../lib/tab-manager.js';
import { captureWithTimeout } from '../lib/fetch-utils.js';
import { SCREENSHOT_CAPTURE_TIMEOUT } from '../constants.js';
import {
  captureSnapshotResponse,
  ensureTabForSnapshot,
  createErrorResult,
} from './snapshot-utils.js';

const waitForLoadCompletion = async (tabId, timeoutMs = 10000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          const ready = document.readyState;
          const hasMain = !!document.querySelector('main, [role="main"], #contents');
          const hasFeed = !!document.querySelector('ytd-rich-grid-renderer, ytd-rich-item-renderer, ytd-video-renderer');
          const pendingNetwork = window.performance?.getEntriesByType('resource')?.some((entry) => entry.initiatorType === 'xmlhttprequest' && !entry.responseEnd);
          return { ready, hasMain, hasFeed, pendingNetwork };
        },
      });

      if (
        result &&
        (result.ready === 'complete' || result.ready === 'interactive') &&
        result.hasMain &&
        (result.hasFeed || result.pendingNetwork === false)
      ) {
        return true;
      }
    } catch (error) {
      console.warn('[MCP Tools] waitForLoadCompletion check failed', error);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  return false;
};

/**
 * Captures a screenshot of the visible tab
 */
export async function handleScreenshot(params = {}) {
  console.log('[MCP Tools] screenshot called');

  try {
    const selection = await selectTab({ requireUrl: true, toolName: 'screenshot' });
    if (!selection.ok) {
      return createErrorResult('Screenshot failed', selection.error);
    }

    const { tabId, tab } = selection;

    console.log('[MCP Tools] screenshot - using tab:', tabId, 'window:', tab.windowId);

    // Validate window state
    const windowValidation = await validateWindow(tab.windowId);
    if (!windowValidation.ok) {
      return createErrorResult('Screenshot failed', windowValidation.error);
    }

    const { windowInfo } = windowValidation;
    console.log('[MCP Tools] screenshot - window state:', windowInfo.state, 'focused:', windowInfo.focused);

    // Capture screenshot with timeout
    console.log('[MCP Tools] screenshot - capturing from window:', tab.windowId);
    const dataUrl = await captureWithTimeout(
      tab.windowId,
      { format: 'png' },
      SCREENSHOT_CAPTURE_TIMEOUT
    );

    console.log('[MCP Tools] screenshot taken', {
      url: tab.url,
      tabId: tabId,
      dataUrlLength: dataUrl?.length || 0
    });

    if (!dataUrl || dataUrl.length === 0) {
      return createErrorResult('Screenshot failed', 'Screenshot capture returned empty data');
    }

    let base64Data = dataUrl;
    let mimeType = 'image/png';
    const dataUrlMatch = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
    if (dataUrlMatch) {
      mimeType = dataUrlMatch[1];
      base64Data = dataUrlMatch[2];
    }

    const meta = {};
    if (typeof tabId === 'number') meta.tabId = tabId;
    if (tab.url) meta.urls = [tab.url];

    return {
      ok: true,
      content: [
        {
          type: 'image',
          data: base64Data,
          mimeType,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        screenshot: dataUrl,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] screenshot error:', e);
    return createErrorResult('Screenshot failed', e);
  }
}

/**
 * Captures an ARIA accessibility tree snapshot of the page
 */
export async function handleSnapshot(params = {}) {
  try {
    const selection = await ensureTabForSnapshot({ toolName: 'snapshot', preferredUrl: params?.url });
    if (selection?.ok === false && selection.content) {
      return selection;
    }
    if (!selection?.ok) {
      return createErrorResult('Snapshot failed', selection?.error || 'Unable to select tab');
    }

    const { tabId, tab } = selection;
    const status = typeof params?.status === 'string' && params.status.trim()
      ? params.status.trim()
      : 'Snapshot captured';

    // Default to full page capture if not specified
    const fullPage = params?.fullPage !== false;

    await waitForLoadCompletion(tabId);

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status,
      details: Array.isArray(params?.details) ? params.details : [],
      fallbackUrl: params?.url || tab?.url,
      fullPage,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        snapshot: snapshotResult.snapshot,
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] snapshot error:', e);
    return createErrorResult('Snapshot failed', e);
  }
}

export async function handleBrowserSnapshotYaml(params = {}) {
  try {
    const selection = await ensureTabForSnapshot({ toolName: 'browser_snapshot', preferredUrl: params?.url });
    if (selection?.ok === false && selection.content) {
      return selection;
    }
    if (!selection?.ok) {
      return createErrorResult('Snapshot failed', selection?.error || 'Unable to select tab');
    }

    const { tabId, tab } = selection;
    const status = typeof params?.status === 'string' && params.status.trim()
      ? params.status.trim()
      : 'Snapshot captured';

    await waitForLoadCompletion(tabId);

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status,
      details: Array.isArray(params?.details) ? params.details : [],
      fallbackUrl: params?.url || tab?.url,
      fullPage: params?.fullPage !== false,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        snapshot: snapshotResult.snapshot,
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] browser_snapshot error:', e);
    return createErrorResult('Snapshot failed', e);
  }
}

export async function handleGetUrl(params = {}) {
  try {
    const selection = await ensureTabForSnapshot({ toolName: 'getUrl', preferredUrl: params?.url });
    if (selection?.ok === false && selection.content) {
      return selection;
    }
    if (!selection?.ok) {
      return createErrorResult('getUrl failed', selection?.error || 'Unable to select tab');
    }

    const { tabId, tab } = selection;
    const url = tab?.url || '';
    const meta = { tabId };
    if (url) meta.urls = [url];

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: url,
        },
      ],
      _meta: meta,
      data: {
        url,
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] getUrl error:', e);
    return createErrorResult('getUrl failed', e);
  }
}

export async function handleGetTitle(params = {}) {
  try {
    const selection = await ensureTabForSnapshot({ toolName: 'getTitle', preferredUrl: params?.url });
    if (selection?.ok === false && selection.content) {
      return selection;
    }
    if (!selection?.ok) {
      return createErrorResult('getTitle failed', selection?.error || 'Unable to select tab');
    }

    const { tabId, tab } = selection;
    const title = tab?.title || '';
    const meta = { tabId };

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: title,
        },
      ],
      _meta: meta,
      data: {
        title,
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] getTitle error:', e);
    return createErrorResult('getTitle failed', e);
  }
}
