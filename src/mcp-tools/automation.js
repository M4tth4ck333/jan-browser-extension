// automation.js
// MCP Bridge automation tools: click, type/keys, input values, drag

import { selectTab } from '../lib/tab-manager.js';
import { createErrorResult } from './snapshot-utils.js';
import {
  getElementDetails,
  getElementDetailsAtPoint,
  prepareElementForAction,
  resolveAccessibilityRef,
  resolveBackendNodeToPoint,
} from './action-targets.js';
import { clickPointWithDebugger, typeTextWithDebugger, sendKeysWithDebugger, waitMs } from './debugger-input.js';

function formatElementLabel(detectedElement = {}, fallbackRef = '') {
  if (!detectedElement) {
    detectedElement = {};
  }
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

function formatCoordinatesLabel(point) {
  if (!point) return 'coordinates';
  const roundedX = Math.round(point.x);
  const roundedY = Math.round(point.y);
  return `coordinates (${roundedX}, ${roundedY})`;
}

function parseCoordinatesString(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)(?:\s*)$/);
  if (!match) return null;
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

function parseTargetInput(rawTarget) {
  if (rawTarget && typeof rawTarget === 'object') {
    const x = Number(rawTarget.x);
    const y = Number(rawTarget.y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      const point = { x, y };
      return { ref: '', coordinates: point, label: formatCoordinatesLabel(point), raw: `${x},${y}` };
    }
  }

  const target = typeof rawTarget === 'string' ? rawTarget.trim() : '';
  if (!target) {
    return { ref: '', coordinates: null, label: '', raw: '' };
  }

  const coordinates = parseCoordinatesString(target);
  if (coordinates) {
    return { ref: '', coordinates, label: formatCoordinatesLabel(coordinates), raw: target };
  }

  return { ref: target, coordinates: null, label: target, raw: target };
}

async function toCssPoint(tabId, devicePoint) {
  if (!devicePoint) return { cssPoint: null, dpr: 1 };
  const [{ result: dprResult }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => window.devicePixelRatio || 1,
  });
  const dpr = Number(dprResult) || 1;
  return {
    cssPoint: { x: devicePoint.x / dpr, y: devicePoint.y / dpr },
    dpr,
  };
}

function normalizeKeysInput(rawKeys) {
  const tokens = [];

  const normalizeName = (name) => {
    const lower = name.toLowerCase();
    if (['ctrl', 'control', 'cmdorctrl'].includes(lower)) return 'Control';
    if (['cmd', 'meta', 'command', 'super', '⌘'].includes(lower)) return 'Meta';
    if (['alt', 'option', '⌥'].includes(lower)) return 'Alt';
    if (['shift', '⇧'].includes(lower)) return 'Shift';
    if (['enter', 'return', '↩', '⏎'].includes(lower)) return 'Enter';
    if (['esc', 'escape'].includes(lower)) return 'Escape';
    if (['space', 'spacebar'].includes(lower)) return ' ';
    if (['tab'].includes(lower)) return 'Tab';
    if (['arrowleft', 'left'].includes(lower)) return 'ArrowLeft';
    if (['arrowright', 'right'].includes(lower)) return 'ArrowRight';
    if (['arrowup', 'up'].includes(lower)) return 'ArrowUp';
    if (['arrowdown', 'down'].includes(lower)) return 'ArrowDown';
    return name;
  };

  const addTokens = (value) => {
    if (value === null || value === undefined) return;
    let str = String(value).trim();
    if (!str) return;
    str = str.replace(/<\/?kbd>/gi, '');
    str = str.replace(/\+/g, ',');
    const parts = str
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 0) {
      tokens.push(...parts.map(normalizeName));
    }
  };

  if (Array.isArray(rawKeys)) {
    rawKeys.forEach(addTokens);
  } else {
    addTokens(rawKeys);
  }

  return tokens;
}

function parseTextAndKeys(rawText) {
  if (typeof rawText !== 'string') return { segments: [], plainText: '' };

  const segments = [];
  const kbdPattern = /<kbd>(.*?)<\/kbd>/gi;
  let lastIndex = 0;
  let match;

  while ((match = kbdPattern.exec(rawText))) {
    if (match.index > lastIndex) {
      const textChunk = rawText.slice(lastIndex, match.index);
      if (textChunk.length > 0) {
        segments.push({ type: 'text', value: textChunk });
      }
    }
    const keysChunk = normalizeKeysInput(match[1]);
    if (keysChunk.length > 0) {
      segments.push({ type: 'keys', keys: keysChunk });
    }
    lastIndex = kbdPattern.lastIndex;
  }

  if (lastIndex < rawText.length) {
    const tail = rawText.slice(lastIndex);
    if (tail.length > 0) {
      segments.push({ type: 'text', value: tail });
    }
  }

  const plainText = segments
    .filter((seg) => seg.type === 'text')
    .map((seg) => seg.value)
    .join('');

  return { segments, plainText };
}

async function pressKeysOnActiveElement(tabId, keys) {
  const sequence = normalizeKeysInput(keys);
  if (sequence.length === 0) {
    return { success: true, pressed: [], target: null };
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (pressedKeys) => {
      const target = document.activeElement && document.activeElement !== document.body
        ? document.activeElement
        : document.body;
      if (!target) {
        return { success: false, error: 'No active element to dispatch key events' };
      }

      const pressSingle = (pressedKey) => {
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

        return { key: pressedKey, defaultPrevented: keydown.defaultPrevented };
      };

      const results = pressedKeys.map((key) => pressSingle(key));
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
        pressed: results,
      };
    },
    args: [sequence],
  });

  return result;
}

export async function handleClickElement(params = {}) {
  const parsedTarget = parseTargetInput(params?.target ?? params?.ref ?? params?.coordinates ?? '');
  const ref = parsedTarget.ref || (typeof params?.ref === 'string' ? params.ref.trim() : '');
  const coordinates = parsedTarget.coordinates;

  if (!ref && !coordinates) {
    return createErrorResult('Click failed', 'Missing target (use snapshot ref or x,y coordinates)');
  }

  try {
    const selection = await selectTab({ toolName: 'browser_click' });
    if (!selection.ok) {
      return createErrorResult('Click failed', selection.error);
    }

    const { tabId, tab } = selection;

    if (coordinates) {
      const { cssPoint, dpr } = await toCssPoint(tabId, coordinates);
      if (!cssPoint) {
        return createErrorResult('Click failed', 'Invalid coordinate target');
      }

      const pointDetails = await getElementDetailsAtPoint(tabId, cssPoint);
      if (!pointDetails?.success) {
        return createErrorResult('Click failed', pointDetails?.error || 'Element not found at coordinates');
      }

      try {
        await clickPointWithDebugger(tabId, cssPoint);
      } catch (err) {
        console.error('[MCP Tools] debugger click failed', err);
        return createErrorResult('Click failed', err);
      }

      const meta = {};
      if (tab?.url) meta.urls = [tab.url];
      if (typeof tabId === 'number') meta.tabId = tabId;

      const elementLabel = formatElementLabel(pointDetails.detectedElement, parsedTarget.label || formatCoordinatesLabel(coordinates));

      return {
        ok: true,
        content: [
          {
            type: 'text',
            text: `Clicked ${elementLabel}`,
          },
        ],
        _meta: Object.keys(meta).length ? meta : undefined,
        data: {
          url: tab?.url,
          target: parsedTarget.raw || formatCoordinatesLabel(coordinates),
          coordinatesDevice: coordinates,
          coordinates: cssPoint,
          devicePixelRatio: dpr,
          detectedElement: pointDetails.detectedElement,
          boundingRect: pointDetails.boundingRect || null,
          timestamp: new Date().toISOString(),
          tabId,
        },
      };
    }

    const resolvedRef = resolveAccessibilityRef(ref, tabId);
    if (!resolvedRef.ok) {
      return createErrorResult('Click failed', resolvedRef.error);
    }
    const backendFallback = resolvedRef.backendValue;
    const cssFallback = resolvedRef.cssValue;

    const preparedTarget = await prepareElementForAction(tabId, {
      ref: resolvedRef.value,
      mode: 'click',
    });

    const elementLabel = formatElementLabel(preparedTarget?.detectedElement, parsedTarget.label || ref);

    if (!preparedTarget?.success || !preparedTarget.clickPoint) {
      const actionDescription = preparedTarget?.actionDescription || 'clicking';
      const errorMessage = preparedTarget?.unsupported
        ? `Element reference ${elementLabel} does not support ${actionDescription} actions (try a different element or refetch snapshot)`
        : preparedTarget?.error || 'Element not found (ref may be stale; capture a new snapshot and retry)';

      if (backendFallback && backendFallback.startsWith('backend:')) {
        const backendNodeId = parseInt(backendFallback.slice(8), 10);
        if (!isNaN(backendNodeId)) {
          const clickPoint = await resolveBackendNodeToPoint(tabId, backendNodeId);
          if (clickPoint) {
            try {
              await clickPointWithDebugger(tabId, clickPoint);
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
                  text: `Clicked ${elementLabel}`,
                },
              ],
              _meta: Object.keys(meta).length ? meta : undefined,
              data: {
                url: tab?.url,
                target: parsedTarget.raw || ref,
                ref,
                resolvedRef: backendFallback,
                clickPoint,
                backendNodeId,
                timestamp: new Date().toISOString(),
                tabId,
              },
            };
          }
        }
      }

      // Fallback: try backend first, then CSS selector
      if (backendFallback && backendFallback.startsWith('backend:')) {
        const backendNodeId = parseInt(backendFallback.slice(8), 10);
        if (!isNaN(backendNodeId)) {
          const clickPoint = await resolveBackendNodeToPoint(tabId, backendNodeId);
          if (clickPoint) {
            try {
              await clickPointWithDebugger(tabId, clickPoint);
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
                  text: `Clicked ${elementLabel}`,
                },
              ],
              _meta: Object.keys(meta).length ? meta : undefined,
              data: {
                url: tab?.url,
                target: parsedTarget.raw || ref,
                ref,
                resolvedRef: backendFallback,
                clickPoint,
                backendNodeId,
                timestamp: new Date().toISOString(),
                tabId,
              },
            };
          }
        }
      }

      if (cssFallback && cssFallback !== resolvedRef.value) {
        const cssTarget = await prepareElementForAction(tabId, { ref: cssFallback, mode: 'click' });
        const cssLabel = formatElementLabel(cssTarget?.detectedElement, parsedTarget.label || ref);
        if (cssTarget?.success && cssTarget.clickPoint) {
          try {
            await clickPointWithDebugger(tabId, cssTarget.clickPoint);
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
                text: `Clicked ${cssLabel}`,
              },
            ],
            _meta: Object.keys(meta).length ? meta : undefined,
            data: {
              url: tab?.url,
              target: parsedTarget.raw || ref,
              ref,
              resolvedRef: cssFallback,
              clickPoint: cssTarget.clickPoint,
              detectedElement: cssTarget.detectedElement,
              boundingRect: cssTarget.boundingRect || null,
              timestamp: new Date().toISOString(),
              tabId,
            },
          };
        }
      }

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
          text: `Clicked ${elementLabel}`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab?.url,
        target: parsedTarget.raw || ref,
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
 * Types text and/or presses keys within an element
 */
export async function handleTypeText(params = {}) {
  const parsedTarget = parseTargetInput(params?.target ?? params?.ref ?? params?.coordinates ?? '');
  const ref = parsedTarget.ref || (typeof params?.ref === 'string' ? params.ref.trim() : '');
  const coordinates = parsedTarget.coordinates;
  const rawText = typeof params?.text === 'string' ? params.text : '';
  const { segments, plainText } = parseTextAndKeys(rawText);
  let clear = params?.clear !== false;
  const appendEnter = params?.submit === true;

  const flatKeys = [];
  segments.forEach((seg) => {
    if (seg.type === 'keys') flatKeys.push(...seg.keys);
  });
  if (appendEnter) {
    flatKeys.push('Enter');
    segments.push({ type: 'keys', keys: ['Enter'] });
  }

  const shouldType = segments.some((seg) => seg.type === 'text' && seg.value.length > 0);
  const shouldPressKeys = flatKeys.length > 0;

  if (!ref && !coordinates) {
    return createErrorResult('Type text failed', 'Missing target (use snapshot ref or x,y coordinates)');
  }

  if (!shouldType && !shouldPressKeys) {
    return createErrorResult('Type text failed', 'Provide text to type or keys to press');
  }

  try {
    const selection = await selectTab({ toolName: 'browser_type' });
    if (!selection.ok) {
      return createErrorResult('Type text failed', selection.error);
    }

    const { tabId, tab } = selection;

    let elementLabel = '';
    let detectedElement = null;
    let boundingRect = null;
    let clickPoint = null;
    let preparedTarget = null;
    let resolvedRefValue = null;

    if (coordinates) {
      const { cssPoint, dpr } = await toCssPoint(tabId, coordinates);
      if (!cssPoint) {
        return createErrorResult('Type text failed', 'Invalid coordinate target');
      }

      const pointDetails = await getElementDetailsAtPoint(tabId, cssPoint);
      if (!pointDetails?.success) {
        return createErrorResult('Type text failed', pointDetails?.error || 'Element not found at coordinates');
      }
      elementLabel = formatElementLabel(pointDetails.detectedElement, parsedTarget.label || formatCoordinatesLabel(coordinates));
      detectedElement = pointDetails.detectedElement;
      boundingRect = pointDetails.boundingRect || null;
      clickPoint = cssPoint;

      try {
        await clickPointWithDebugger(tabId, cssPoint);
      } catch (err) {
        console.error('[MCP Tools] debugger click failed', err);
        return createErrorResult('Type text failed', err);
      }
    } else {
      const resolvedRef = resolveAccessibilityRef(ref, tabId);
      if (!resolvedRef.ok) {
        return createErrorResult('Type text failed', resolvedRef.error);
      }
      resolvedRefValue = resolvedRef.value;

      const typingRef = resolvedRef.cssValue || resolvedRef.value;

      preparedTarget = await prepareElementForAction(tabId, {
        ref: typingRef,
        mode: 'type',
      });

      elementLabel = formatElementLabel(preparedTarget?.detectedElement, parsedTarget.label || ref);

      if (!preparedTarget?.success || !preparedTarget.clickPoint) {
        const actionDescription = preparedTarget?.actionDescription || 'typing';
        const errorMessage = preparedTarget?.unsupported
          ? `Element reference ${elementLabel} does not support ${actionDescription} actions`
          : preparedTarget?.error || 'Element not found';
        return createErrorResult('Type text failed', errorMessage);
      }

      const tagName = (preparedTarget?.detectedElement?.tagName || '').toLowerCase();
      if (tagName === 'canvas') {
        return createErrorResult('Type text failed', 'Canvas elements do not support typing actions');
      }

      try {
        await clickPointWithDebugger(tabId, preparedTarget.clickPoint);
        clickPoint = preparedTarget.clickPoint;
      } catch (err) {
        console.error('[MCP Tools] debugger click failed', err);
        return createErrorResult('Type text failed', err);
      }

      detectedElement = preparedTarget.detectedElement || null;
      boundingRect = preparedTarget.boundingRect || null;
    }

    // Defensive clear via DOM for stubborn inputs (e.g., some search boxes)
    if (clear) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const el = document.activeElement;
            if (!el) return;
            if (typeof el.value === 'string') {
              el.value = '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          },
        });
      } catch (err) {
        console.warn('[MCP Tools] DOM clear fallback failed:', err);
      }
    }

    await waitMs(120);

    let typed = null;
    let pressedKeysResult = null;
    const pressedKeysLog = [];

    for (const segment of segments) {
      if (segment.type === 'text' && segment.value.length > 0) {
        const textSegment = segment.value;
        const result = await typeTextWithDebugger(tabId, textSegment, { clear, pressEnter: false });
        clear = false; // Only clear once
        if (!result?.success) {
          return createErrorResult('Type text failed', result?.error || 'Typing failed');
        }
        typed = typed || { typedCharacters: 0 };
        typed.typedCharacters += textSegment.length;
      } else if (segment.type === 'keys' && segment.keys.length > 0) {
        const result = await sendKeysWithDebugger(tabId, segment.keys);
        if (!result?.success) {
          return createErrorResult('Type text failed', result?.error || 'Key press failed');
        }
        pressedKeysResult = result;
        if (Array.isArray(result.sequence)) {
          pressedKeysLog.push(...result.sequence);
        }
      }
    }

    const statusParts = [];
    if (typed && typed.typedCharacters > 0) {
      const truncated = plainText.length > 80 ? `${plainText.slice(0, 77)}...` : plainText;
      statusParts.push(`Typed "${truncated}"${params?.clear === false ? '' : ' (cleared first)'}`);
    }
    if (pressedKeysLog.length) {
      statusParts.push(`pressed keys ${pressedKeysLog.join(', ')}`);
    }

    const statusAction = statusParts.join(' and ');
    const status = statusAction ? `${statusAction} in ${elementLabel}` : `Interacted with ${elementLabel}`;

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
        target: parsedTarget.raw || ref,
        ref,
        resolvedRef: resolvedRefValue,
        text: shouldType ? rawText.slice(0, 200) : '',
        typedText: shouldType ? plainText.slice(0, 200) : '',
        clear,
        keys: pressedKeysLog,
        result: typed,
        pressedKeys: pressedKeysLog,
        smartDetection: preparedTarget?.smartDetection || false,
        detectedElement,
        clickPoint,
        boundingRect,
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
          text: `Hovered ${elementLabel}`,
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
 * Directly sets values on form controls (selects, checkboxes, radios, inputs)
 */
export async function handleInputValue(params = {}) {
  const parsedTarget = parseTargetInput(params?.target ?? params?.ref ?? params?.coordinates ?? '');
  const ref = parsedTarget.ref || (typeof params?.ref === 'string' ? params.ref.trim() : '');
  const coordinates = parsedTarget.coordinates;
  const values = Array.isArray(params?.values) ? params.values.map((val) => String(val)) : [];
  const hasSingleValue = params?.value !== undefined && params?.value !== null;
  const singleValue = hasSingleValue ? params.value : values[0];

  if ((!ref && !coordinates) || (!hasSingleValue && values.length === 0)) {
    return createErrorResult('Input failed', 'Missing target or value to apply');
  }

  try {
    const selection = await selectTab({ toolName: 'browser_input' });
    if (!selection.ok) {
      return createErrorResult('Input failed', selection.error);
    }

    const { tabId, tab } = selection;

    const resolvedRef = ref ? resolveAccessibilityRef(ref, tabId) : { ok: true, value: '' };
    if (ref && !resolvedRef.ok) {
      return createErrorResult('Input failed', resolvedRef.error);
    }

    let cssCoords = null;
    if (coordinates) {
      const { cssPoint, dpr } = await toCssPoint(tabId, coordinates);
      if (!cssPoint) {
        return createErrorResult('Input failed', 'Invalid coordinate target');
      }
      cssCoords = { point: cssPoint, dpr };
    }

    const elementDetails = cssCoords
      ? await getElementDetailsAtPoint(tabId, cssCoords.point)
      : await getElementDetails(tabId, resolvedRef.value);
    if (!elementDetails?.success) {
      return createErrorResult('Input failed', elementDetails?.error || 'Element not found');
    }

    const elementLabel = formatElementLabel(
      elementDetails.detectedElement,
      parsedTarget.label || ref,
    );

    const [{ result: updated }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ ref, coords, vals, single }) => {
        const resolveElementFromRef = (reference) => {
          if (typeof reference !== 'string' || reference.length === 0) return null;

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

        const resolveFromCoordinates = (point) => {
          if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return null;
          return document.elementFromPoint(point.x, point.y);
        };

        const el = coords ? resolveFromCoordinates(coords) : resolveElementFromRef(ref);
        if (!el) return { success: false, error: 'Target element not found' };

        const normalizeBoolean = (raw) => {
          if (typeof raw === 'boolean') return raw;
          if (typeof raw === 'string') {
            const lowered = raw.trim().toLowerCase();
            if (['true', '1', 'yes', 'on', 'checked'].includes(lowered)) return true;
            if (['false', '0', 'no', 'off', 'unchecked'].includes(lowered)) return false;
          }
          return null;
        };

        const normalizedValues = Array.isArray(vals) && vals.length ? vals.map(String) : [];
        const primaryValue = single !== undefined && single !== null ? String(single) : (normalizedValues[0] ?? null);
        const booleanValue = normalizeBoolean(single);

        if (el.tagName === 'SELECT') {
          if (el.multiple) {
            const valueSet = new Set(normalizedValues);
            Array.from(el.options).forEach((option) => {
              option.selected = valueSet.has(option.value) || valueSet.has(option.textContent || '');
            });
          } else if (primaryValue !== null) {
            el.value = primaryValue;
          }
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, selectedValues: normalizedValues, finalValue: el.value };
        }

        if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
          const shouldCheck = booleanValue !== null ? booleanValue : true;
          el.checked = shouldCheck;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, checked: el.checked };
        }

        if (primaryValue !== null) {
          el.value = primaryValue;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return { success: true, finalValue: el.value };
        }

        return { success: false, error: 'No applicable value provided' };
      },
      args: [{ ref: resolvedRef.value, coords: cssCoords?.point, vals: values, single: singleValue }],
    });

    if (!updated?.success) {
      return createErrorResult('Input failed', updated?.error || 'Unable to apply value');
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    const appliedValue = hasSingleValue ? singleValue : values;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Updated ${elementLabel} via ${parsedTarget.label || ref}`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        target: parsedTarget.raw || ref,
        ref,
        coordinatesDevice: coordinates,
        coordinates: cssCoords?.point || null,
        devicePixelRatio: cssCoords?.dpr || null,
        resolvedRef: resolvedRef.value,
        value: appliedValue,
        result: updated,
        detectedElement: elementDetails.detectedElement,
        boundingRect: elementDetails.boundingRect,
        elementLabel,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] browser_input error:', e);
    return createErrorResult('Input failed', e);
  }
}

/**
 * Drag an element and drop it on another element
 */
export async function handleDragElement(params = {}) {
  const startTarget = parseTargetInput(
    params?.start ?? params?.startRef ?? params?.fromSelector ?? params?.startSelector ?? params?.startCoordinates ?? '',
  );
  const endTarget = parseTargetInput(
    params?.end ?? params?.endRef ?? params?.toSelector ?? params?.endSelector ?? params?.endCoordinates ?? '',
  );

  const startRef = startTarget.ref || (typeof params?.startRef === 'string' ? params.startRef.trim() : '');
  const endRef = endTarget.ref || (typeof params?.endRef === 'string' ? params.endRef.trim() : '');
  const startCoordinates = startTarget.coordinates;
  const endCoordinates = endTarget.coordinates;

  if ((!startRef && !startCoordinates) || (!endRef && !endCoordinates)) {
    return createErrorResult('Drag failed', 'Missing drag start or end target (use ref or x,y coordinates)');
  }

  try {
    const selection = await selectTab({ toolName: 'browser_drag' });
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
    const startCss = startCoordinates ? await toCssPoint(tabId, startCoordinates) : null;
    const endCss = endCoordinates ? await toCssPoint(tabId, endCoordinates) : null;

    const startDetails = startCss?.cssPoint
      ? await getElementDetailsAtPoint(tabId, startCss.cssPoint)
      : await getElementDetails(tabId, resolvedStartRef.value);
    if (!startDetails?.success) {
      return createErrorResult('Drag failed', startDetails?.error || 'Start element not found');
    }

    const endDetails = endCss?.cssPoint
      ? await getElementDetailsAtPoint(tabId, endCss.cssPoint)
      : await getElementDetails(tabId, resolvedEndRef.value);
    if (!endDetails?.success) {
      return createErrorResult('Drag failed', endDetails?.error || 'End element not found');
    }

    const startLabel = formatElementLabel(
      startDetails?.detectedElement,
      startTarget.label || (startCoordinates ? formatCoordinatesLabel(startCoordinates) : startRef || 'start element'),
    );
    const endLabel = formatElementLabel(
      endDetails?.detectedElement,
      endTarget.label || (endCoordinates ? formatCoordinatesLabel(endCoordinates) : endRef || 'end element'),
    );

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ startParams, endParams }) => {
        const resolveElement = ({ ref, coordinates }) => {
          if (coordinates && typeof coordinates.x === 'number' && typeof coordinates.y === 'number') {
            return document.elementFromPoint(coordinates.x, coordinates.y);
          }
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

          if (typeof ref === 'string' && ref.startsWith('css:')) {
            const selectorText = ref.slice(4);
            if (selectorText) {
              try {
                const resolved = document.querySelector(selectorText);
                if (resolved) return resolved;
              } catch (_) {
                return null;
              }
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
      args: [
        {
          startParams: { ref: resolvedStartRef.value, coordinates: startCoordinates },
          endParams: { ref: resolvedEndRef.value, coordinates: endCoordinates },
        },
      ],
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
        startTarget: startTarget.raw || startRef,
        endTarget: endTarget.raw || endRef,
        startRef,
        endRef,
        startCoordinatesDevice: startCoordinates,
        endCoordinatesDevice: endCoordinates,
        startCoordinates: startCss?.cssPoint || null,
        endCoordinates: endCss?.cssPoint || null,
        devicePixelRatioStart: startCss?.dpr || null,
        devicePixelRatioEnd: endCss?.dpr || null,
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
