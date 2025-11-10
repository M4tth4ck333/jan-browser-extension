// observation.js
// MCP Bridge observation tools: screenshot, snapshot

import { selectTab, validateWindow } from '../lib/tab-manager.js';
import { captureWithTimeout } from '../lib/fetch-utils.js';
import { SCREENSHOT_CAPTURE_TIMEOUT } from '../constants.js';
import { captureSnapshotResponse, ensureTabForSnapshot, createErrorResult } from './snapshot-utils.js';

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

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status,
      details: Array.isArray(params?.details) ? params.details : [],
      fallbackUrl: params?.url || tab?.url,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        ...snapshotResult.snapshot,
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] snapshot error:', e);
    return createErrorResult('Snapshot failed', e);
  }
}
