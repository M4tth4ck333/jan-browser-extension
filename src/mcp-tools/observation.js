// observation.js
// MCP Bridge observation tools: screenshot, snapshot

import { selectTab, validateWindow } from '../lib/tab-manager.js';
import { getElementRefMap } from '../lib/element-ref-map.js';
import { captureWithTimeout } from '../lib/fetch-utils.js';
import { SCREENSHOT_CAPTURE_TIMEOUT } from '../constants.js';
import {
  captureSnapshotResponse,
  ensureTabForSnapshot,
  attachDebugger,
  detachDebugger,
  sendDebuggerCommand,
  createErrorResult,
} from './snapshot-utils.js';

async function captureWithDebugger(tabId) {
  const target = { tabId };
  await attachDebugger(target);
  try {
    await sendDebuggerCommand(target, 'Page.enable', {});
    const { data } = await sendDebuggerCommand(target, 'Page.captureScreenshot', { format: 'png', fromSurface: true });
    if (!data) {
      throw new Error('DevTools screenshot returned no data');
    }
    return `data:image/png;base64,${data}`;
  } finally {
    try {
      await detachDebugger(target);
    } catch (err) {
      console.warn('[MCP Tools] Failed to detach debugger after screenshot:', err);
    }
  }
}

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

  const includeRefs = params?.includeRefs === true;
  let overlayShown = false;
  let lastTabId = null;

  try {
    const selection = await selectTab({ requireUrl: true, toolName: 'screenshot', allowCreate: false });
    if (!selection.ok) {
      return createErrorResult('Screenshot failed', selection.error);
    }

    const { tabId, tab } = selection;
    lastTabId = tabId;

    console.log('[MCP Tools] screenshot - using tab:', tabId, 'window:', tab.windowId);

    // Validate window state
    const windowValidation = await validateWindow(tab.windowId);
    if (!windowValidation.ok) {
      return createErrorResult('Screenshot failed', windowValidation.error);
    }

    const { windowInfo } = windowValidation;
    console.log('[MCP Tools] screenshot - window state:', windowInfo.state, 'focused:', windowInfo.focused);

    // Try to build ARIA tree and show inline refs if available
    // This is optional - if it fails quickly, we take screenshot immediately
    const startTime = Date.now();
    if (includeRefs) {
      try {
        // Quick attempt to build ARIA tree - no waiting for load completion
        const snapshotResult = await captureSnapshotResponse({
          tabId,
          status: '',
          details: [],
          fallbackUrl: tab?.url,
          fullPage: false, // Only capture viewport for screenshot
        });

        console.log(`[MCP Tools] ARIA tree built in ${Date.now() - startTime}ms`);

        // Show visual reference overlay BEFORE taking screenshot if refMap is available
        const refMap = snapshotResult?.snapshot?.refMap;
        if (refMap && Object.keys(refMap).length > 0) {
          const overlayRefMap = Object.fromEntries(
            Object.entries(refMap)
              .map(([key, val]) => {
                if (val && typeof val === 'object') {
                  return val.css ? [key, val.css] : null;
                }
                return [key, val];
              })
              .filter(Boolean)
          );
          try {
            // Try to inject content scripts if not already loaded
            try {
              await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content/reference-overlay.js'],
              });
              console.log('[MCP Tools] Injected reference-overlay.js');
            } catch (injectError) {
              // Already injected or failed - that's okay, try to send message anyway
              console.log('[MCP Tools] reference-overlay.js already loaded or injection failed:', injectError?.message);
            }

            await chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_REFERENCE_OVERLAY',
              payload: { refMap: overlayRefMap },
            });
            overlayShown = true;
            console.log('[MCP Tools] Visual reference overlay shown on tab', tabId, 'refs:', Object.keys(refMap).length);

            // Wait for overlay to render before screenshot
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch (overlayError) {
            console.warn('[MCP Tools] Failed to show reference overlay:', overlayError);
          }
        } else {
          console.log('[MCP Tools] No refMap available, screenshot without inline refs');
        }
      } catch (snapshotError) {
        console.warn('[MCP Tools] Failed to build ARIA tree for screenshot (took', Date.now() - startTime, 'ms), proceeding without inline refs:', snapshotError);
      }

      // Fallback: if no overlay was shown, try using the cached ref map
      if (!overlayShown) {
        const cachedRefMap = getElementRefMap(tabId);
        if (cachedRefMap && Object.keys(cachedRefMap).length > 0) {
          const overlayRefMap = Object.fromEntries(
            Array.from(cachedRefMap.entries())
              .map(([key, val]) => {
                if (val && typeof val === 'object') {
                  return val.css ? [key, val.css] : null;
                }
                return [key, val];
              })
              .filter(Boolean)
          );
          try {
            await chrome.tabs.sendMessage(tabId, {
              type: 'SHOW_REFERENCE_OVERLAY',
              payload: { refMap: overlayRefMap },
            });
            overlayShown = true;
            console.log('[MCP Tools] Fallback overlay shown from cached ref map on tab', tabId);
            await new Promise((resolve) => setTimeout(resolve, 200));
          } catch (fallbackError) {
            console.warn('[MCP Tools] Failed to show fallback reference overlay:', fallbackError);
          }
        }
      }
    }

    // Capture screenshot with debugger (does not steal focus).
    console.log('[MCP Tools] screenshot - capturing via DevTools screenshot');
    const dataUrl = await captureWithDebugger(tabId);

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
  } finally {
    if (overlayShown && lastTabId !== null) {
      try {
        await chrome.tabs.sendMessage(lastTabId, { type: 'HIDE_REFERENCE_OVERLAY' });
        console.log('[MCP Tools] Reference overlay hidden after screenshot');
      } catch (hideError) {
        console.warn('[MCP Tools] Failed to hide reference overlay after screenshot:', hideError);
      }
    }
  }
}

/**
 * Captures an ARIA accessibility tree snapshot of the page
 */
export async function handleSnapshot(params = {}) {
  try {
    const selection = await ensureTabForSnapshot({ toolName: 'snapshot', preferredUrl: params?.url, allowCreate: false });
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
