// automation.js
// MCP Bridge automation tools: click, type, hover, fill_form, select_option, press_key, drag

import { selectTab } from '../lib/tab-manager.js';
import { TAB_REGISTRATION_DELAY } from '../constants.js';
import { createErrorResult } from './snapshot-utils.js';
import { getElementDetails, prepareElementForAction, resolveAccessibilityRef } from './action-targets.js';
import { clickPointWithDebugger, typeTextWithDebugger, waitMs } from './debugger-input.js';

function formatElementLabel(detectedElement = {}, fallbackRef = '') {
  const tag = detectedElement.tagName ? detectedElement.tagName.toLowerCase() : '';
  const role = detectedElement.role ? `role="${detectedElement.role}"` : '';
  const type = detectedElement.type ? `type="${detectedElement.type}"` : '';

  const descriptorSource = [
    detectedElement.ariaLabel,
    detectedElement.ariaDescription,
    detectedElement.text,
    detectedElement.placeholder,
    detectedElement.value,
  ]
    .map((val) => (typeof val === 'string' ? val.trim() : ''))
    .find(Boolean);

  const descriptor =
    descriptorSource && descriptorSource.length > 120
      ? `${descriptorSource.slice(0, 117)}...`
      : descriptorSource;

  const descriptorSegment = descriptor ? ` "${descriptor}"` : '';
  const metaParts = [role, type].filter(Boolean);
  const metaSegment = metaParts.length ? ` (${metaParts.join(' ')})` : '';
  const baseLabel = `${tag || 'element'}${descriptorSegment}${metaSegment}`.trim();

  const trimmedRef = typeof fallbackRef === 'string' ? fallbackRef.trim() : '';
  const isRefLike = /^s\d+e\d+$/i.test(trimmedRef) || trimmedRef.startsWith('css:');
  const prefix = trimmedRef ? (isRefLike ? `ref: ${trimmedRef}` : trimmedRef) : '';

  return prefix ? `${prefix} - ${baseLabel}` : baseLabel;
}

/**
 * Fills multiple form fields
 */
export async function handleBrowserFillForm(params) {
  const fields = Array.isArray(params?.fields) ? params.fields : [];

  if (fields.length === 0) {
    return createErrorResult('Fill form failed', 'Missing or empty fields array');
  }

  console.log('[MCP Tools] browser_fill_form', { fieldCount: fields.length });

  try {
    const selection = await selectTab({ toolName: 'browser_fill_form' });
    if (!selection.ok) {
      return createErrorResult('Fill form failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors for each field
    const resolvedFields = [];
    for (const field of fields) {
      if (field.ref) {
        const resolvedRef = resolveAccessibilityRef(field.ref, tabId);
        if (!resolvedRef.ok) {
          return createErrorResult('Fill form failed', resolvedRef.error);
        }
        resolvedFields.push({ ...field, ref: resolvedRef.value, originalRef: field.ref });
      } else {
        resolvedFields.push(field);
      }
    }

    const [{ result: fillResult }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (fieldsToFill) => {
        const resolveElementFromRef = (reference) => {
          if (typeof reference !== 'string' || reference.length === 0) return null;

          // Handle Shadow DOM references
          if (reference.includes('##')) {
            const parts = reference.split('##');
            let current = null;
            if (parts[0].startsWith('css:')) {
              const hostSelector = parts[0].slice(4);
              try {
                current = document.querySelector(hostSelector);
              } catch (_) {
                return null;
              }
            }
            if (!current) return null;
            for (let i = 1; i < parts.length; i++) {
              if (!current.shadowRoot) return null;
              try {
                current = current.shadowRoot.querySelector(parts[i]);
              } catch (_) {
                return null;
              }
              if (!current) return null;
            }
            return current;
          }

          // Regular CSS selector
          if (reference.startsWith('css:')) {
            const selectorText = reference.slice(4);
            if (!selectorText) return null;
            try {
              return document.querySelector(selectorText);
            } catch (_) {
              return null;
            }
          }
          return null;
        };

        const results = [];
        for (const field of fieldsToFill) {
          const el = resolveElementFromRef(field.ref) || (field.selector ? document.querySelector(field.selector) : null);
          if (!el) {
            results.push({ selector: field.selector, ref: field.ref, success: false, error: 'Element not found' });
            continue;
          }

          if (el.tagName === 'SELECT') {
            el.value = field.value;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = field.value === 'true' || field.value === true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } else {
            el.value = field.value;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }

          results.push({ selector: field.selector, ref: field.ref, success: true, value: field.value });
        }
        return results;
      },
      args: [resolvedFields],
    });

    const failedFields = fillResult.filter((r) => !r.success);
    const successCount = fillResult.length - failedFields.length;

    console.log('[MCP Tools] form filled', { url: tab.url, successCount, failedCount: failedFields.length });

    const success = failedFields.length === 0;
    const status = success
      ? `Filled ${successCount} form fields`
      : `Filled ${successCount} of ${fields.length} form fields (some failed)`;

    const details = [];
    if (failedFields.length > 0) {
      const failedList = failedFields.map((f) => f.selector).join(', ');
      details.push(`Failed selectors: ${failedList.slice(0, 200)}`);
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    const response = {
      ok: success,
      content: [
        {
          type: 'text',
          text: status,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        totalFields: fields.length,
        successfulFields: successCount,
        failedFields,
        results: fillResult,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };

    if (!success) {
      response.isError = true;
    }

    return response;
  } catch (e) {
    console.error('[MCP Tools] browser_fill_form error:', e);
    return createErrorResult('Fill form failed', e);
  }
}

export async function handleBrowserRef(params = {}) {
  const ref = typeof params?.ref === 'string' ? params.ref.trim() : '';

  if (!ref) {
    return createErrorResult('Resolve ref failed', 'Missing element ref parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'browser_ref' });
    if (!selection.ok) {
      return createErrorResult('Resolve ref failed', selection.error);
    }

    const { tabId, tab } = selection;
    const resolvedRef = resolveAccessibilityRef(ref, tabId);
    if (!resolvedRef.ok) {
      return createErrorResult('Resolve ref failed', resolvedRef.error);
    }

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (reference) => {
        const resolveElementFromRef = (refValue) => {
          if (typeof refValue !== 'string' || refValue.length === 0) return null;
          if (refValue.includes('##')) {
            const parts = refValue.split('##');
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

          if (refValue.startsWith('css:')) {
            const selectorText = refValue.slice(4);
            if (!selectorText) return null;
            try {
              return document.querySelector(selectorText);
            } catch (err) {
              return null;
            }
          }

          try {
            return (
              document.querySelector(`[data-aria-id="${refValue}"]`) ||
              document.getElementById(refValue) ||
              document.querySelector(refValue)
            );
          } catch (err) {
            return null;
          }
        };

        const el = resolveElementFromRef(reference);
        if (!el) {
          return { success: false, error: 'Element not found' };
        }

        const rect = el.getBoundingClientRect();
        const textContent = (el.innerText || el.textContent || '').trim();
        return {
          success: true,
          detectedElement: {
            tagName: el.tagName || null,
            role: el.getAttribute?.('role') || null,
            id: el.id || null,
            className: el.className || null,
            name: el.getAttribute?.('name') || null,
            type: el.getAttribute?.('type') || null,
            ariaLabel: el.getAttribute?.('aria-label') || null,
            ariaDescription: el.getAttribute?.('aria-description') || null,
            href: el.getAttribute?.('href') || null,
          },
          boundingRect: rect ? { ...rect.toJSON?.(), x: rect.x, y: rect.y } : null,
          text: textContent.slice(0, 500),
          value: el.value !== undefined ? String(el.value).slice(0, 200) : null,
          isContentEditable:
            el.isContentEditable || el.contentEditable === 'true' || el.getAttribute?.('contenteditable') === 'true',
        };
      },
      args: [resolvedRef.value],
    });

    if (!result?.success) {
      return createErrorResult('Resolve ref failed', result?.error || 'Element lookup failed');
    }

    const elementLabel = formatElementLabel(result.detectedElement, ref);
    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Reference ${ref} resolves to ${elementLabel}`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab?.url,
        ref,
        resolvedRef: resolvedRef.value,
        element: result.detectedElement,
        boundingRect: result.boundingRect,
        text: result.text,
        value: result.value,
        isContentEditable: result.isContentEditable,
        elementLabel,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] browser_ref error:', e);
    return createErrorResult('Resolve ref failed', e);
  }
}

export async function handleClickElement(params = {}) {
  const ref = typeof params?.ref === 'string' ? params.ref.trim() : '';

  if (!ref) {
    return createErrorResult('Click failed', 'Missing element ref parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'browser_click' });
    if (!selection.ok) {
      return createErrorResult('Click failed', selection.error);
    }

    const { tabId, tab } = selection;
    const resolvedRef = resolveAccessibilityRef(ref, tabId);
    if (!resolvedRef.ok) {
      return createErrorResult('Click failed', resolvedRef.error);
    }

    const preparedTarget = await prepareElementForAction(tabId, {
      ref: resolvedRef.value,
      mode: 'click',
    });

    const elementLabel = formatElementLabel(preparedTarget?.detectedElement, ref);

    if (!preparedTarget?.success || !preparedTarget.clickPoint) {
      const actionDescription = preparedTarget?.actionDescription || 'clicking';
      const errorMessage = preparedTarget?.unsupported
        ? `Element reference ${elementLabel} does not support ${actionDescription} actions`
        : preparedTarget?.error || 'Element not found';
      return createErrorResult('Click failed', errorMessage);
    }

    try {
      await clickPointWithDebugger(tabId, preparedTarget.clickPoint);
    } catch (err) {
      console.error('[MCP Tools] debugger click failed', err);
      return createErrorResult('Click failed', err);
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Clicked ${elementLabel} (ref ${ref})`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab?.url,
        ref,
        resolvedRef: resolvedRef.value,
        clickPoint: preparedTarget.clickPoint,
        detectedElement: preparedTarget.detectedElement,
        boundingRect: preparedTarget.boundingRect || null,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] browser_click error:', e);
    return createErrorResult('Click failed', e);
  }
}

/**
 * Types text into an element (supports input, textarea, and contenteditable)
 */
export async function handleTypeText(params) {
  const ref = typeof params?.ref === 'string' ? params.ref.trim() : '';
  const text = String(params?.text || '');
  const clear = params?.clear !== false;
  const pressEnter = params?.pressEnter === true;

  if (!ref) {
    return createErrorResult('Type text failed', 'Missing element ref parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'type_text' });
    if (!selection.ok) {
      return createErrorResult('Type text failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedRef = resolveAccessibilityRef(ref, tabId);
    if (!resolvedRef.ok) {
      return createErrorResult('Type text failed', resolvedRef.error);
    }

    const preparedTarget = await prepareElementForAction(tabId, {
      ref: resolvedRef.value,
      mode: 'type',
    });

    const elementLabel = formatElementLabel(preparedTarget?.detectedElement, ref);

    if (!preparedTarget?.success || !preparedTarget.clickPoint) {
      const actionDescription = preparedTarget?.actionDescription || 'typing';
      const errorMessage = preparedTarget?.unsupported
        ? `Element reference ${elementLabel} does not support ${actionDescription} actions`
        : preparedTarget?.error || 'Element not found';
      return createErrorResult('Type text failed', errorMessage);
    }

    try {
      await clickPointWithDebugger(tabId, preparedTarget.clickPoint);
    } catch (err) {
      console.error('[MCP Tools] debugger click failed', err);
      return createErrorResult('Type text failed', err);
    }

    await waitMs(120);

    const typed = await typeTextWithDebugger(tabId, text, { clear, pressEnter });
    if (!typed?.success) {
      return createErrorResult('Type text failed', typed?.error || 'Typing failed');
    }

    const truncated = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    const status = pressEnter
      ? `Typed "${truncated}" and pressed Enter in ${elementLabel} (ref ${ref})`
      : `Typed "${truncated}" in ${elementLabel} (ref ${ref})`;

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: status,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        ref,
        resolvedRef: resolvedRef.value,
        text: text.slice(0, 200),
        clear,
        pressEnter,
        result: typed,
        smartDetection: preparedTarget.smartDetection || false,
        detectedElement: preparedTarget.detectedElement || null,
        clickPoint: preparedTarget.clickPoint,
        boundingRect: preparedTarget.boundingRect || null,
        elementLabel,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] type_text error:', e);
    return createErrorResult('Type text failed', e);
  }
}

/**
 * Hovers over an element
 */
export async function handleHoverElement(params) {
  const ref = typeof params?.ref === 'string' ? params.ref.trim() : '';

  if (!ref) {
    return createErrorResult('Hover failed', 'Missing element ref parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'hover_element' });
    if (!selection.ok) {
      return createErrorResult('Hover failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedRef = resolveAccessibilityRef(ref, tabId);
    if (!resolvedRef.ok) {
      return createErrorResult('Hover failed', resolvedRef.error);
    }

    const elementDetails = await getElementDetails(tabId, resolvedRef.value);
    if (!elementDetails?.success) {
      return createErrorResult('Hover failed', elementDetails?.error || 'Element not found');
    }

    const elementLabel = formatElementLabel(elementDetails.detectedElement, ref);

    const [{ result: hovered }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ ref }) => {
        const resolveElementFromRef = (reference) => {
          if (typeof reference !== 'string' || reference.length === 0) return null;

          // Handle Shadow DOM references (format: css:host##shadow-selector##nested)
          if (reference.includes('##')) {
            const parts = reference.split('##');
            let current = null;
            if (parts[0].startsWith('css:')) {
              const hostSelector = parts[0].slice(4);
              try {
                current = document.querySelector(hostSelector);
              } catch (_) {
                return null;
              }
            }
            if (!current) return null;
            for (let i = 1; i < parts.length; i++) {
              if (!current.shadowRoot) return null;
              try {
                current = current.shadowRoot.querySelector(parts[i]);
              } catch (_) {
                return null;
              }
              if (!current) return null;
            }
            return current;
          }

          // Regular CSS selector
          if (reference.startsWith('css:')) {
            const selectorText = reference.slice(4);
            if (!selectorText) return null;
            try {
              return document.querySelector(selectorText);
            } catch (_) {
              return null;
            }
          }
          return null;
        };

        const el = resolveElementFromRef(ref);
        if (!el) return { success: false, error: 'Element not found' };
        const event = new MouseEvent('mouseover', { bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return { success: true };
      },
      args: [{ ref: resolvedRef.value }],
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!hovered.success) {
      return createErrorResult('Hover failed', hovered.error || 'Hover failed');
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Hovered ${elementLabel} (ref ${ref})`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        ref,
        resolvedRef: resolvedRef.value,
        detectedElement: elementDetails.detectedElement,
        boundingRect: elementDetails.boundingRect,
        elementLabel,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] hover_element error:', e);
    return createErrorResult('Hover failed', e);
  }
}

/**
 * Selects an option from a dropdown
 */
export async function handleSelectOption(params) {
  const ref = typeof params?.ref === 'string' ? params.ref.trim() : '';
  const values = Array.isArray(params?.values) && params.values.length > 0
    ? params.values.map((val) => String(val))
    : (params?.value ? [String(params.value)] : []);

  if (!ref || values.length === 0) {
    return createErrorResult('Select option failed', 'Missing element ref or values parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'select_option' });
    if (!selection.ok) {
      return createErrorResult('Select option failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedRef = resolveAccessibilityRef(ref, tabId);

    const elementDetails = await getElementDetails(tabId, resolvedRef.value);
    if (!elementDetails?.success) {
      return createErrorResult('Select option failed', elementDetails?.error || 'Element not found');
    }

    const elementLabel = formatElementLabel(elementDetails.detectedElement, ref);

    const [{ result: selected }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ ref, vals }) => {
        const resolveElementFromRef = (reference) => {
          if (typeof reference !== 'string' || reference.length === 0) return null;

          // Handle Shadow DOM references
          if (reference.includes('##')) {
            const parts = reference.split('##');
            let current = null;
            if (parts[0].startsWith('css:')) {
              const hostSelector = parts[0].slice(4);
              try {
                current = document.querySelector(hostSelector);
              } catch (_) {
                return null;
              }
            }
            if (!current) return null;
            for (let i = 1; i < parts.length; i++) {
              if (!current.shadowRoot) return null;
              try {
                current = current.shadowRoot.querySelector(parts[i]);
              } catch (_) {
                return null;
              }
              if (!current) return null;
            }
            return current;
          }

          // Regular CSS selector
          if (reference.startsWith('css:')) {
            const selectorText = reference.slice(4);
            if (!selectorText) return null;
            try {
              return document.querySelector(selectorText);
            } catch (_) {
              return null;
            }
          }
          return null;
        };

        const el = resolveElementFromRef(ref);
        if (!el || el.tagName !== 'SELECT') return { success: false, error: 'Select element not found' };

        const normalizedValues = Array.isArray(vals) && vals.length ? vals : [];
        if (el.multiple) {
          const valueSet = new Set(normalizedValues);
          Array.from(el.options).forEach((option) => {
            option.selected = valueSet.has(option.value) || valueSet.has(option.textContent || '');
          });
        } else if (normalizedValues.length) {
          el.value = normalizedValues[0];
        }

        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, selectedValues: normalizedValues, finalValue: el.value };
      },
      args: [{ ref: resolvedRef.value, vals: values }],
    });

    if (!selected.success) {
      return createErrorResult('Select option failed', selected.error || 'Selection failed');
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Selected option via ${elementLabel} (ref ${ref})`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        ref,
        resolvedRef: resolvedRef.value,
        values,
        result: selected,
        detectedElement: elementDetails.detectedElement,
        boundingRect: elementDetails.boundingRect,
        elementLabel,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] select_option error:', e);
    return createErrorResult('Select option failed', e);
  }
}

/**
 * Press a keyboard key on the active element (or document body)
 */
export async function handlePressKey(params = {}) {
  const key = String(params?.key || '').trim();

  if (!key) {
    return createErrorResult('Press key failed', 'Missing key parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'press_key' });
    if (!selection.ok) {
      return createErrorResult('Press key failed', selection.error);
    }

    const { tabId, tab } = selection;

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (pressedKey) => {
        const target = document.activeElement && document.activeElement !== document.body
          ? document.activeElement
          : document.body;
        if (!target) {
          return { success: false, error: 'No active element to dispatch key events' };
        }

        const keyCode = pressedKey.length === 1 ? pressedKey.toUpperCase().charCodeAt(0) : 0;
        const eventInit = {
          key: pressedKey,
          code: pressedKey.length === 1 ? `Key${pressedKey.toUpperCase()}` : pressedKey,
          keyCode,
          which: keyCode,
          bubbles: true,
          cancelable: true,
        };

        const keydown = new KeyboardEvent('keydown', eventInit);
        target.dispatchEvent(keydown);

        if (!keydown.defaultPrevented) {
          const keypress = new KeyboardEvent('keypress', eventInit);
          target.dispatchEvent(keypress);
        }

        const keyup = new KeyboardEvent('keyup', eventInit);
        target.dispatchEvent(keyup);

        const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : null;
        return {
          success: true,
          target: {
            tagName: target.tagName || 'BODY',
            id: target.id || null,
            role: target.getAttribute?.('role') || null,
            name: target.getAttribute?.('name') || null,
            type: target.getAttribute?.('type') || null,
            className: target.className || null,
            ariaLabel: target.getAttribute?.('aria-label') || null,
            ariaDescription: target.getAttribute?.('aria-description') || null,
            placeholder: target.getAttribute?.('placeholder') || null,
            text: (target.textContent || '').trim().slice(0, 500) || null,
            value: target.value !== undefined ? String(target.value).slice(0, 200) : null,
            boundingRect: rect ? { ...rect.toJSON?.(), x: rect.x, y: rect.y } : null,
          },
        };
      },
      args: [key],
    });

    if (!result?.success) {
      return createErrorResult('Press key failed', result?.error || 'Key dispatch failed');
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    const elementLabel = formatElementLabel(result.target, 'active element');

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Pressed key ${key} on ${elementLabel}`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab?.url,
        key,
        target: result.target,
        elementLabel,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] press_key error:', e);
    return createErrorResult('Press key failed', e);
  }
}

/**
 * Drag an element and drop it on another element
 */
export async function handleDragElement(params = {}) {
  const startRef = typeof params?.startRef === 'string' ? params.startRef.trim() : '';
  const endRef = typeof params?.endRef === 'string' ? params.endRef.trim() : '';
  const fromSelector = String(params?.fromSelector || params?.startSelector || '').trim();
  const toSelector = String(params?.toSelector || params?.endSelector || '').trim();

  if ((!startRef && !fromSelector) || (!endRef && !toSelector)) {
    return createErrorResult('Drag failed', 'Missing drag start or end reference');
  }

  try {
    const selection = await selectTab({ toolName: 'drag_element' });
    if (!selection.ok) {
      return createErrorResult('Drag failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedStartRef = startRef ? resolveAccessibilityRef(startRef, tabId) : { ok: true, value: '' };
    if (startRef && !resolvedStartRef.ok) {
      return createErrorResult('Drag failed', resolvedStartRef.error);
    }
    const resolvedEndRef = endRef ? resolveAccessibilityRef(endRef, tabId) : { ok: true, value: '' };
    if (endRef && !resolvedEndRef.ok) {
      return createErrorResult('Drag failed', resolvedEndRef.error);
    }

    const startTargetRef = resolvedStartRef.value || fromSelector;
    const endTargetRef = resolvedEndRef.value || toSelector;

    const startDetails = startTargetRef ? await getElementDetails(tabId, startTargetRef) : null;
    if (startTargetRef && !startDetails?.success) {
      return createErrorResult('Drag failed', startDetails?.error || 'Start element not found');
    }

    const endDetails = endTargetRef ? await getElementDetails(tabId, endTargetRef) : null;
    if (endTargetRef && !endDetails?.success) {
      return createErrorResult('Drag failed', endDetails?.error || 'End element not found');
    }

    const startLabel = formatElementLabel(startDetails?.detectedElement, startRef || fromSelector || 'start element');
    const endLabel = formatElementLabel(endDetails?.detectedElement, endRef || toSelector || 'end element');

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ startParams, endParams }) => {
        const resolveElement = ({ ref, selector }) => {
          // Handle Shadow DOM references
          if (typeof ref === 'string' && ref.includes('##')) {
            const parts = ref.split('##');
            let current = null;
            if (parts[0].startsWith('css:')) {
              const hostSelector = parts[0].slice(4);
              try {
                current = document.querySelector(hostSelector);
              } catch (_) {
                return null;
              }
            }
            if (!current) return null;
            for (let i = 1; i < parts.length; i++) {
              if (!current.shadowRoot) return null;
              try {
                current = current.shadowRoot.querySelector(parts[i]);
              } catch (_) {
                return null;
              }
              if (!current) return null;
            }
            return current;
          }

          // Regular CSS selector from ref
          if (typeof ref === 'string' && ref.startsWith('css:')) {
            const selectorText = ref.slice(4);
            if (selectorText) {
              try {
                const resolved = document.querySelector(selectorText);
                if (resolved) return resolved;
              } catch (_) {
                // ignore
              }
            }
          }

          // Fallback to selector parameter
          if (selector) {
            try {
              return document.querySelector(selector);
            } catch (_) {
              return null;
            }
          }
          return null;
        };

        const start = resolveElement(startParams);
        const end = resolveElement(endParams);
        if (!start) {
          return { success: false, error: 'Start element not found' };
        }
        if (!end) {
          return { success: false, error: 'End element not found' };
        }

        const startRect = start.getBoundingClientRect();
        const endRect = end.getBoundingClientRect();

        const startX = startRect.left + startRect.width / 2;
        const startY = startRect.top + startRect.height / 2;
        const endX = endRect.left + endRect.width / 2;
        const endY = endRect.top + endRect.height / 2;

        const pointerInit = (x, y) => ({
          bubbles: true,
          cancelable: true,
          composed: true,
          clientX: x,
          clientY: y,
        });

        const movePointer = (x, y) => document.dispatchEvent(new PointerEvent('pointermove', {
          ...pointerInit(x, y),
          buttons: 1,
        }));

        start.dispatchEvent(new PointerEvent('pointerdown', { ...pointerInit(startX, startY), buttons: 1 }));
        start.dispatchEvent(new MouseEvent('mousedown', { ...pointerInit(startX, startY), buttons: 1 }));

        const steps = 6;
        for (let i = 1; i <= steps; i += 1) {
          const progress = i / steps;
          const x = startX + (endX - startX) * progress;
          const y = startY + (endY - startY) * progress;
          movePointer(x, y);
        }

        end.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit(endX, endY) }));
        end.dispatchEvent(new MouseEvent('mouseup', { ...pointerInit(endX, endY) }));

        return {
          success: true,
          startTag: start.tagName,
          endTag: end.tagName,
        };
      },
      args: [{ startParams: { ref: resolvedStartRef.value, selector: fromSelector }, endParams: { ref: resolvedEndRef.value, selector: toSelector } }],
    });

    if (!result?.success) {
      return createErrorResult('Drag failed', result?.error || 'Drag operation failed');
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Dragged ${startLabel} to ${endLabel}`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab?.url,
        fromSelector,
        toSelector,
        startRef,
        endRef,
        resolvedStartRef: startRef ? resolvedStartRef.value : null,
        resolvedEndRef: endRef ? resolvedEndRef.value : null,
        startTag: result.startTag,
        endTag: result.endTag,
        startElement: startDetails?.detectedElement || null,
        endElement: endDetails?.detectedElement || null,
        startBoundingRect: startDetails?.boundingRect || null,
        endBoundingRect: endDetails?.boundingRect || null,
        startClickPoint: startDetails?.clickPoint || null,
        endClickPoint: endDetails?.clickPoint || null,
        startLabel,
        endLabel,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] drag_element error:', e);
    return createErrorResult('Drag failed', e);
  }
}
