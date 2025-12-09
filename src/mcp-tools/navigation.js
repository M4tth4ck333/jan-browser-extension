// navigation.js
// MCP Bridge navigation tools: visit, go_back, go_forward, scroll

import { selectTab, setMcpRegisteredTab, getMcpRegisteredTab } from '../lib/tab-manager.js';
import { CONTENT_LOAD_TIMEOUT, TAB_REGISTRATION_DELAY, VisitOutputModes } from '../constants.js';
import { captureSnapshotResponse, clearSnapshotsForTab, combineResultWithSnapshot, createErrorResult } from './snapshot-utils.js';
import { waitForLoadCompletion } from './observation.js';
import { resolveAccessibilityRef, resolveBackendNodeToPoint } from './action-targets.js';

export async function handleNavigate(params = {}) {
  const rawTarget = typeof params?.target === 'string' ? params.target.trim() : '';
  const direction = typeof params?.direction === 'string' ? params.direction.trim() : '';
  const fallback = typeof params?.url === 'string' ? params.url.trim() : '';
  const target = rawTarget || direction || fallback;
  const UNSAFE_PROTOCOL_PATTERN =
    /^(javascript:|data:|file:|vbscript:|chrome:|edge:|safari-extension:|moz-extension:|opera:)/i;

  if (!target) {
    return createErrorResult('Navigate failed', 'Missing target (URL or "back"/"forward")');
  }

  const lowered = target.toLowerCase();
  if (lowered === 'back' || lowered === 'backward') {
    return handleGoBack(params);
  }
  if (lowered === 'forward') {
    return handleGoForward(params);
  }

  if (UNSAFE_PROTOCOL_PATTERN.test(target)) {
    return createErrorResult('Navigate failed', 'Unsafe navigation target rejected');
  }

  const normalizedTarget = target.match(/^https?:\/\//i) ? target : `https://${target}`;

  return handleVisit({ ...params, url: normalizedTarget });
}

/**
 * Visits a URL and extracts page content
 * If no tab is registered, creates and registers a new tab
 * If a tab is already registered, navigates that tab to the new URL
 */
export async function handleVisit(params) {
  const url = String(params?.url || '').trim();
  if (!url) {
    return createErrorResult('Visit failed', 'Missing url parameter');
  }

  // Validate URL
  try {
    new URL(url);
  } catch (e) {
    return createErrorResult('Visit failed', `Invalid URL: ${url}`);
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
      try {
        await chrome.tabs.get(registeredTabId);
        console.log('[MCP Tools] Using existing registered tab:', registeredTabId);
        await chrome.tabs.update(registeredTabId, { url, active: false });
        tabId = registeredTabId;
      } catch (e) {
        console.log('[MCP Tools] Registered tab no longer exists, creating new tab');
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;
        isNewTab = true;
      }
    } else {
      console.log('[MCP Tools] No registered tab, creating new tab');
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;
      isNewTab = true;
    }

    clearSnapshotsForTab(tabId);

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

    await waitForLoadCompletion(tabId);

    // Extract page content
    const response = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_CONTENT' });

    if (!response || !response.ok) {
      await chrome.tabs.remove(tabId);
      return createErrorResult('Visit failed', 'Failed to extract page content');
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

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status: 'Snapshot after navigate',
      details: result.url ? [`URL: ${result.url}`] : [],
      fallbackUrl: result.url,
    });

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

      // Keep the tab available for follow-up actions without stealing focus
      console.log('[MCP Tools] Tab registered without changing active window/tab focus');
    }

    console.log('[MCP Tools] visit result', {
      url: result.url,
      title: result.title,
      contentLength: result.markdown?.length || result.text?.length || result.html?.length || 0,
      closeTab: closeTab,
      tabId: tabId
    });

    const body = (() => {
      if (mode === VisitOutputModes.HTML && result.html) {
        return `\`\`\`html\n${result.html}\n\`\`\``;
      }
      if (mode === VisitOutputModes.TEXT && result.text) {
        return result.text;
      }
      if (result.markdown) {
        return result.markdown;
      }
      return result.text || result.html || '';
    })();

    const keepTabNote = closeTab ? '' : '\n\n[Tab kept open for subsequent operations]';
    const textContent = `Navigated to ${result.url}\n\nTitle: ${result.title}\n\n${body}${keepTabNote}`;

    const meta = {};
    if (result.url) meta.urls = [result.url];
    if (!closeTab && result.tabId) meta.tabId = result.tabId;

    if (closeTab) {
      result.tabId = null;
    }

    const baseResult = {
      ok: true,
      content: [
        {
          type: 'text',
          text: textContent,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: result,
    };

    return combineResultWithSnapshot(baseResult, snapshotResult, tabId);
  } catch (e) {
    console.error('[MCP Tools] visit error:', e);
    return createErrorResult('Visit failed', e);
  }
}

/**
 * Goes back in browser history
 */
export async function handleGoBack(params) {
  try {
    const selection = await selectTab({ toolName: 'browser_navigate', allowCreate: false });
    if (!selection.ok) {
      return createErrorResult('Go back failed', selection.error);
    }

    const { tabId } = selection;

    await chrome.tabs.goBack(tabId);
    await new Promise((resolve) => setTimeout(resolve, TAB_REGISTRATION_DELAY));

    const finalTab = await chrome.tabs.get(tabId);
    clearSnapshotsForTab(tabId);

    const meta = {};
    if (finalTab.url) meta.urls = [finalTab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status: 'Snapshot after navigate back',
      details: finalTab.url ? [`URL: ${finalTab.url}`] : [],
      fallbackUrl: finalTab.url,
    });

    const baseResult = {
      ok: true,
      content: [
        {
          type: 'text',
          text: 'Navigated back',
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: finalTab.url,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };

    return combineResultWithSnapshot(baseResult, snapshotResult, tabId);
  } catch (e) {
    console.error('[MCP Tools] go_back error:', e);
    return createErrorResult('Go back failed', e);
  }
}

/**
 * Goes forward in browser history
 */
export async function handleGoForward(params) {
  try {
    const selection = await selectTab({ toolName: 'browser_navigate', allowCreate: false });
    if (!selection.ok) {
      return createErrorResult('Go forward failed', selection.error);
    }

    const { tabId } = selection;

    await chrome.tabs.goForward(tabId);
    await new Promise((resolve) => setTimeout(resolve, TAB_REGISTRATION_DELAY));

    const finalTab = await chrome.tabs.get(tabId);
    clearSnapshotsForTab(tabId);

    const meta = {};
    if (finalTab.url) meta.urls = [finalTab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status: 'Snapshot after navigate forward',
      details: finalTab.url ? [`URL: ${finalTab.url}`] : [],
      fallbackUrl: finalTab.url,
    });

    const baseResult = {
      ok: true,
      content: [
        {
          type: 'text',
          text: 'Navigated forward',
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: finalTab.url,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };

    return combineResultWithSnapshot(baseResult, snapshotResult, tabId);
  } catch (e) {
    console.error('[MCP Tools] go_forward error:', e);
    return createErrorResult('Go forward failed', e);
  }
}

/**
 * Scrolls the page
 */
export async function handleScroll(params) {
  const direction = String(params?.direction || 'down');
  const rawAmount = Number(params?.amount);
  const amount = Number.isFinite(rawAmount) ? rawAmount : 500;
  const targetRef = typeof params?.target === 'string' ? params.target.trim() : '';

  try {
    const selection = await selectTab({ toolName: 'browser_scroll', allowCreate: false });
    if (!selection.ok) {
      return createErrorResult('Scroll failed', selection.error);
    }

    const { tabId, tab } = selection;

    const resolvedTarget = targetRef
      ? resolveAccessibilityRef(targetRef, tabId)
      : { ok: true, value: '', cssValue: '', backendValue: null };

    if (!resolvedTarget.ok) {
      return createErrorResult('Scroll failed', resolvedTarget.error);
    }

    const backendNodeId = resolvedTarget.backendValue?.startsWith('backend:')
      ? Number(resolvedTarget.backendValue.slice('backend:'.length))
      : null;

    const resolvedRef = resolvedTarget.cssValue || resolvedTarget.value || '';
    let scrollResult = null;

    if (backendNodeId && !resolvedTarget.cssValue) {
      const backendPoint = await resolveBackendNodeToPoint(tabId, backendNodeId);
      if (!backendPoint) {
        return createErrorResult('Scroll failed', 'Could not resolve element position for provided ref');
      }

      const target = { tabId };
      const deltaY =
        direction === 'top'
          ? -Math.max(amount, 1200)
          : direction === 'bottom'
          ? Math.max(amount, 1200)
          : direction === 'up'
          ? -amount
          : amount;

      try {
        await chrome.debugger.attach(target, '1.3');
        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: backendPoint.x,
          y: backendPoint.y,
        });
        await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: backendPoint.x,
          y: backendPoint.y,
          deltaY,
          deltaX: 0,
        });
        scrollResult = {
          success: true,
          direction,
          amount: direction === 'up' || direction === 'down' ? Math.abs(deltaY) : null,
          target: resolvedRef || targetRef,
          scrolledElement: true,
          pointerBased: true,
          boundingRect: backendPoint.boundingRect || null,
        };
      } catch (err) {
        return createErrorResult('Scroll failed', err?.message || err);
      } finally {
        try {
          await chrome.debugger.detach(target);
        } catch (detachErr) {
          console.warn('[MCP Tools] scroll detach warning:', detachErr);
        }
      }
    } else {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (dir, amt, ref) => {
          const scrollWithin = (el) => {
            if (!el) return false;
            if (dir === 'top') {
              el.scrollTo ? el.scrollTo({ top: 0, behavior: 'auto' }) : (el.scrollTop = 0);
            } else if (dir === 'bottom') {
              const max = el.scrollHeight ?? document.body.scrollHeight;
              el.scrollTo ? el.scrollTo({ top: max, behavior: 'auto' }) : (el.scrollTop = max);
            } else if (dir === 'up') {
              el.scrollBy ? el.scrollBy({ top: -amt, behavior: 'auto' }) : (el.scrollTop -= amt);
            } else {
              el.scrollBy ? el.scrollBy({ top: amt, behavior: 'auto' }) : (el.scrollTop += amt);
            }
            return true;
          };

          const resolveElementFromRef = (reference) => {
            if (typeof reference !== 'string' || reference.length === 0) return null;

            if (reference.includes('##')) {
              const parts = reference.split('##');
              let current = null;
              if (parts[0].startsWith('css:')) {
                const hostSelector = parts[0].slice(4);
                try {
                  current = document.querySelector(hostSelector);
                } catch (err) {
                  return null;
                }
              }
              if (!current) return null;
              for (let i = 1; i < parts.length; i++) {
                if (!current.shadowRoot) return null;
                try {
                  current = current.shadowRoot.querySelector(parts[i]);
                } catch (err) {
                  return null;
                }
                if (!current) return null;
              }
              return current;
            }

            if (reference.startsWith('css:')) {
              const selectorText = reference.slice(4);
              if (!selectorText) return null;
              try {
                return document.querySelector(selectorText);
              } catch (err) {
                return null;
              }
            }

            try {
              let element = document.querySelector(`[data-aria-id="${reference}"]`);
              if (element) return element;
              element = document.getElementById(reference);
              if (element) return element;
              element = document.querySelector(reference);
              if (element) return element;
            } catch (err) {
              // ignore
            }
            return null;
          };

          if (ref) {
            const el = resolveElementFromRef(ref);
            if (!el) {
              return { success: false, error: 'Element not found for provided ref', direction: dir, amount: amt, target: ref };
            }
            scrollWithin(el);
            return {
              success: true,
              direction: dir,
              amount: dir === 'up' || dir === 'down' ? amt : null,
              target: ref,
              scrolledElement: true,
            };
          }

          scrollWithin(window);
          return {
            success: true,
            direction: dir,
            amount: dir === 'up' || dir === 'down' ? amt : null,
            target: null,
            scrolledElement: false,
          };
        },
        args: [direction, amount, resolvedRef],
      });

      scrollResult = result;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!scrollResult?.success) {
      return createErrorResult('Scroll failed', scrollResult?.error || 'Unknown scroll error');
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    if (scrollResult.boundingRect) {
      meta.boundingRect = scrollResult.boundingRect;
    }

    if (scrollResult.scrolledElement && resolvedRef && !scrollResult.pointerBased) {
      const [{ result: elementMeta }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: (ref) => {
          const resolveElementFromRef = (reference) => {
            if (typeof reference !== 'string' || reference.length === 0) return null;

            if (reference.includes('##')) {
              const parts = reference.split('##');
              let current = null;
              if (parts[0].startsWith('css:')) {
                const hostSelector = parts[0].slice(4);
                try {
                  current = document.querySelector(hostSelector);
                } catch (err) {
                  return null;
                }
              }
              if (!current) return null;
              for (let i = 1; i < parts.length; i++) {
                if (!current.shadowRoot) return null;
                try {
                  current = current.shadowRoot.querySelector(parts[i]);
                } catch (err) {
                  return null;
                }
                if (!current) return null;
              }
              return current;
            }

            if (reference.startsWith('css:')) {
              const selectorText = reference.slice(4);
              if (!selectorText) return null;
              try {
                return document.querySelector(selectorText);
              } catch (err) {
                return null;
              }
            }

            try {
              let element = document.querySelector(`[data-aria-id="${reference}"]`);
              if (element) return element;
              element = document.getElementById(reference);
              if (element) return element;
              element = document.querySelector(reference);
              if (element) return element;
            } catch (err) {
              // ignore
            }
            return null;
          };

          const element = resolveElementFromRef(ref);
          if (!element) return { boundingRect: null, scrollTop: null };
          const rect = element.getBoundingClientRect?.();
          return {
            boundingRect: rect
              ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left }
              : null,
            scrollTop: element.scrollTop ?? null,
          };
        },
        args: [resolvedRef],
      });

      if (elementMeta?.boundingRect) meta.boundingRect = elementMeta.boundingRect;

      return {
        ok: true,
        content: [
          {
            type: 'text',
            text:
              `Scrolled element ${targetRef || resolvedRef} ${direction}` +
              (scrollResult.amount ? ` (${scrollResult.amount}px)` : ''),
          },
        ],
        _meta: Object.keys(meta).length ? meta : undefined,
        data: {
          url: tab.url,
          direction,
          amount: scrollResult.amount,
          target: targetRef || resolvedRef,
          timestamp: new Date().toISOString(),
          tabId,
          targetScrollTop: elementMeta?.scrollTop ?? null,
        },
      };
    }

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Scrolled ${direction}` + (scrollResult.amount ? ` (${scrollResult.amount}px)` : ''),
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        direction,
        amount: scrollResult.amount,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] scroll_page error:', e);
    return createErrorResult('Scroll failed', e);
  }
}
