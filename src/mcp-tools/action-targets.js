// action-targets.js
// Element resolution and capability checks for automation actions

import { ELEMENT_ACTION_CAPABILITIES } from './element-action-map.js';
import { getElementSelector, hasElementRefMap, getBackendNodeId, getFrameId, hasRef, getRefMetadata } from '../lib/element-ref-map.js';

export function resolveAccessibilityRef(ref, tabId) {
  const normalized = typeof ref === 'string' ? ref.trim() : '';
  // Updated pattern to match iframe refs: s1e1 or s1f1e5
  const isAccessibilityRef = normalized && /^s\d+(?:f\d+)?e\d+$/i.test(normalized);

  if (!isAccessibilityRef) {
    return { ok: true, value: normalized, originalRef: normalized, usedSnapshot: false, backendValue: null, cssValue: normalized, frameId: null };
  }

  const snapshotAvailable = hasElementRefMap(tabId);
  if (!snapshotAvailable) {
    return { ok: true, value: normalized, originalRef: normalized, usedSnapshot: false, backendValue: null, cssValue: normalized, frameId: null };
  }

  const mappedSelector = getElementSelector(tabId, normalized);
  const backendId = getBackendNodeId(tabId, normalized);
  const frameId = getFrameId(tabId, normalized);
  const backendValue = backendId !== null ? `backend:${backendId}` : null;
  const refExists = hasRef(tabId, normalized);
  const { parentRef, childIndex } = getRefMetadata(tabId, normalized);

  // Check if ref exists at all (including placeholder refs)
  if (!refExists) {
    return {
      ok: false,
      value: null,
      originalRef: normalized,
      usedSnapshot: true,
      frameId: null,
      error: `Reference ${normalized} was not found in the latest snapshot. Capture a fresh snapshot and try again.`,
    };
  }

  // If ref exists but has no selector/backend, it's a placeholder - still allow it with frameId
  if (!mappedSelector && backendId === null) {
    console.warn(`[action-targets] Ref ${normalized} is a placeholder (no selector/backend) - will use allFrames search`);
    return {
      ok: true,
      value: normalized, // Return the ref itself for allFrames search
      originalRef: normalized,
      usedSnapshot: true,
      backendValue: null,
      cssValue: null,
      frameId, // Include frameId so allFrames can be used
      isPlaceholder: true,
    };
  }

  // Prefer backend for click durability but carry css fallback
  if (backendValue) {
    return {
      ok: true,
      value: backendValue,
      originalRef: normalized,
      usedSnapshot: true,
      backendValue,
      cssValue: mappedSelector || null,
      frameId, // Include frameId for iframe elements
      parentRef,
      childIndex,
    };
  }

  if (mappedSelector) {
    return {
      ok: true,
      value: mappedSelector,
      originalRef: normalized,
      usedSnapshot: true,
      backendValue: null,
      cssValue: mappedSelector,
      frameId,
      parentRef,
      childIndex,
    };
  }

  return {
    ok: true,
    value: normalized,
    originalRef: normalized,
    usedSnapshot: true,
    backendValue: null,
    cssValue: null,
    frameId,
    parentRef,
    childIndex,
  };
}

/**
 * Resolve a backend node ID to bounding box coordinates
 * @param {number} tabId - Tab ID
 * @param {number} backendNodeId - Backend DOM node ID
 * @returns {Promise<{x: number, y: number} | null>} Center point or null
 */
export async function resolveBackendNodeToPoint(tabId, backendNodeId) {
  try {
    const target = { tabId };
    await chrome.debugger.attach(target, '1.3');

    try {
      try {
        await chrome.debugger.sendCommand(target, 'DOM.scrollIntoViewIfNeeded', {
          backendNodeId,
        });
        // Wait for scroll to complete and layout to stabilize
        await new Promise((resolve) => setTimeout(resolve, 100));
      } catch (err) {
        console.warn('[Action Targets] scrollIntoViewIfNeeded failed:', err);
      }

      const { model } = await chrome.debugger.sendCommand(target, 'DOM.getBoxModel', {
        backendNodeId,
      });

      if (model && model.content && model.content.length >= 8) {
        // content is [x1, y1, x2, y2, x3, y3, x4, y4] - calculate center
        const xs = [model.content[0], model.content[2], model.content[4], model.content[6]];
        const ys = [model.content[1], model.content[3], model.content[5], model.content[7]];
        const centerX = xs.reduce((a, b) => a + b, 0) / 4;
        const centerY = ys.reduce((a, b) => a + b, 0) / 4;
        const left = Math.min(...xs);
        const right = Math.max(...xs);
        const top = Math.min(...ys);
        const bottom = Math.max(...ys);

        console.log(`[Action Targets] Backend node ${backendNodeId} box model:`, {
          content: model.content,
          center: { x: Math.round(centerX), y: Math.round(centerY) },
          bounds: { left, top, right, bottom, width: right - left, height: bottom - top },
        });

        await chrome.debugger.detach(target);
        return {
          x: Math.round(centerX),
          y: Math.round(centerY),
          boundingRect: {
            x: left,
            y: top,
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
          },
        };
      }

      await chrome.debugger.detach(target);
      return null;
    } catch (err) {
      await chrome.debugger.detach(target);
      throw err;
    }
  } catch (err) {
    console.error('[Action Targets] Failed to resolve backend node to point:', err);
    return null;
  }
}

export async function prepareElementForAction(tabId, { ref, mode, frameId }) {
  // Build target - if this is an iframe element, execute in all frames
  const target = { tabId };
  if (frameId) {
    // Use allFrames to execute in all frames (main + iframes)
    target.allFrames = true;
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target,
    func: async ({ ref, mode, capabilityMap }) => {
      const resolveElementFromRef = (reference) => {
        if (typeof reference !== 'string' || reference.length === 0) {
          return null;
        }

        // backend: references are resolved server-side via Chrome DevTools Protocol
        if (reference.startsWith('backend:')) {
          return null;
        }

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

      const hasFrameworkBindings = (element) => {
        try {
          const elementKeys = Object.keys(element);
          const hasReactProps = elementKeys.some(
            (key) =>
              key.startsWith('__reactProps') ||
              key.startsWith('__reactFiber') ||
              key.startsWith('__reactInternalInstance'),
          );
          if (hasReactProps) return true;
        } catch (err) {
          // ignore
        }
        if (element.__vue__ || element.__vueParentComponent) return true;
        if (element.hasAttribute?.('ng-click') || element.hasAttribute?.('(click)')) return true;
        return false;
      };

      const hasClassHint = (element, hints = []) => {
        if (!hints || !hints.length || !element) return false;
        if (element.classList) {
          return hints.some((hint) => element.classList.contains(hint));
        }
        const className = element.className ? String(element.className) : '';
        if (!className) return false;
        const parts = className.split(/\s+/).filter(Boolean);
        return hints.some((hint) => parts.includes(hint));
      };

      const elementMatchesCapability = (element, caps = {}) => {
        if (!element || !caps) return false;
        const tagName = (element.tagName || '').toUpperCase();
        const role = (element.getAttribute?.('role') || '').toLowerCase();
        const typeAttr = (element.type || element.getAttribute?.('type') || '').toLowerCase();
        const normalizedType = typeAttr || 'text';
        const isContentEditable =
          element.isContentEditable ||
          element.contentEditable === 'true' ||
          element.getAttribute?.('contenteditable') === 'true';

        if (Array.isArray(caps.tagNames) && caps.tagNames.includes(tagName)) {
          if (tagName === 'INPUT' && Array.isArray(caps.inputTypes)) {
            return caps.inputTypes.includes(normalizedType);
          }
          return true;
        }

        if (Array.isArray(caps.roles) && caps.roles.includes(role)) {
          return true;
        }

        if (caps.allowContentEditable && isContentEditable) {
          return true;
        }

        if (Array.isArray(caps.attributeHints)) {
          const attributeMatch = caps.attributeHints.some((attr) => element.hasAttribute?.(attr));
          if (attributeMatch) return true;
        }

        if (hasClassHint(element, caps.classHints)) {
          return true;
        }

        if (caps.pointerCursor) {
          try {
            const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
            if (style?.cursor === 'pointer') return true;
          } catch (err) {
            // ignore
          }
        }

        if (caps.frameworkDetection && hasFrameworkBindings(element)) {
          return true;
        }

        return false;
      };

      const findElementMatchingCapability = (element, caps = {}) => {
        if (!element) return null;
        if (elementMatchesCapability(element, caps)) {
          return element;
        }
        const selectors = Array.isArray(caps.nestedSelectors) ? caps.nestedSelectors : [];
        for (const selector of selectors) {
          if (!selector) continue;
          try {
            const nested = element.querySelector(selector);
            if (nested && elementMatchesCapability(nested, caps)) {
              return nested;
            }
          } catch (err) {
            // ignore
          }
          if (element.shadowRoot) {
            try {
              const nestedShadow = element.shadowRoot.querySelector(selector);
              if (nestedShadow && elementMatchesCapability(nestedShadow, caps)) {
                return nestedShadow;
              }
            } catch (err) {
              // ignore
            }
          }
        }
        return null;
      };

      const findClickableElement = (element) => {
        if (!element) return null;
        const resolved = findElementMatchingCapability(element, capabilityMap.click || {});
        if (resolved) return resolved;

        if (element.shadowRoot) {
          const shadowResolved = findElementMatchingCapability(element.shadowRoot, capabilityMap.click || {});
          if (shadowResolved) return shadowResolved;
        }

        if (element.tagName === 'IFRAME') {
          try {
            const iframeDoc = element.contentDocument || element.contentWindow?.document;
            if (iframeDoc) {
              const nested = findElementMatchingCapability(iframeDoc.body, capabilityMap.click || {});
              if (nested) return nested;
            }
          } catch (err) {
            // ignore
          }
        }

        return null;
      };

      const findTypeableElement = (element) => {
        if (!element) return null;
        const resolved = findElementMatchingCapability(element, capabilityMap.type || {});
        if (resolved) return resolved;
        if (element.shadowRoot) {
          const shadowResolved = findElementMatchingCapability(element.shadowRoot, capabilityMap.type || {});
          if (shadowResolved) return shadowResolved;
        }
        return null;
      };

      let el = ref ? resolveElementFromRef(ref) : null;
      const sourceElement = el;
      if (!el) {
        return { success: false, error: 'Element not found', detectedElement: null, actionDescription: mode };
      }

      if (mode === 'click') {
        el = findClickableElement(el);
      } else if (mode === 'type') {
        el = findTypeableElement(el);
      }

      const buildDetectedElement = (element) => {
        if (!element) return null;
        const textContent = (element.innerText || element.textContent || '').trim();
        return {
          tagName: element.tagName || 'unknown',
          role: element.getAttribute?.('role') || null,
          id: element.id || null,
          className: element.className || null,
          name: element.getAttribute?.('name') || null,
          type: element.getAttribute?.('type') || null,
          ariaLabel: element.getAttribute?.('aria-label') || null,
          ariaDescription: element.getAttribute?.('aria-description') || null,
          placeholder: element.getAttribute?.('placeholder') || null,
          text: textContent ? textContent.slice(0, 500) : null,
          value: element.value !== undefined ? String(element.value).slice(0, 200) : null,
        };
      };

      if (!el) {
        const actionDescription = mode === 'type' ? 'typing' : 'clicking';
        return {
          success: false,
          error: `Element reference does not support ${actionDescription} actions`,
          unsupported: true,
          actionDescription,
          detectedElement: buildDetectedElement(sourceElement),
        };
      }

      const waitForLayout = () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // Try to bring the element (or its option) into view before measuring/clicking
      try {
        if (typeof el.scrollIntoView === 'function') {
          el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
        }
      } catch (err) {
        try {
          el.scrollIntoView();
        } catch (_) {
          // ignore
        }
      }

      await waitForLayout();

      const targetRect = el.getBoundingClientRect();

      // getBoundingClientRect() returns coordinates relative to the viewport
      // Input.dispatchMouseEvent expects viewport-relative coordinates
      // No additional offset needed - visualViewport.offset* only applies for pinch-zoom scenarios
      const clickPoint = {
        x: targetRect.left + targetRect.width / 2,
        y: targetRect.top + targetRect.height / 2,
      };

      const detectedElement = buildDetectedElement(el);

      const smartDetection = hasFrameworkBindings(el) || Boolean(el.getAttribute?.('role'));

      return {
        success: true,
        clickPoint,
        detectedElement,
        smartDetection,
        boundingRect: targetRect ? { ...targetRect.toJSON?.(), x: targetRect.x, y: targetRect.y } : null,
      };
    },
    args: [{ ref, mode, capabilityMap: ELEMENT_ACTION_CAPABILITIES }],
  });

  return result;
}

export async function getElementDetails(tabId, ref) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: ({ ref }) => {
      const resolveElementFromRef = (reference) => {
        if (typeof reference !== 'string' || reference.length === 0) {
          return null;
        }

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

      const el = resolveElementFromRef(ref);
      if (!el) {
        return { success: false, error: 'Element not found' };
      }

      const rect = el?.getBoundingClientRect ? el.getBoundingClientRect() : null;

      const detectedElement = {
        tagName: el.tagName || 'unknown',
        role: el.getAttribute?.('role') || null,
        id: el.id || null,
        className: el.className || null,
        name: el.getAttribute?.('name') || null,
        type: el.getAttribute?.('type') || null,
        ariaLabel: el.getAttribute?.('aria-label') || null,
        ariaDescription: el.getAttribute?.('aria-description') || null,
        placeholder: el.getAttribute?.('placeholder') || null,
        text: (el.textContent || '').trim().slice(0, 500) || null,
        value: el.value !== undefined ? String(el.value).slice(0, 200) : null,
      };

      const boundingRect = rect ? { ...rect.toJSON?.(), x: rect.x, y: rect.y } : null;
      let clickPoint = null;
      if (rect) {
        clickPoint = {
          x: rect.left + viewportX + rect.width / 2,
          y: rect.top + viewportY + rect.height / 2,
        };
      }

      return { success: true, detectedElement, boundingRect, clickPoint };
    },
    args: [{ ref }],
  });

  return result;
}

export async function getElementDetailsAtPoint(tabId, point) {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
    return { success: false, error: 'Invalid coordinates' };
  }

  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: ({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      if (!element) {
        return { success: false, error: `No element found at coordinates (${x}, ${y})` };
      }

      const rect = element.getBoundingClientRect?.();

      const detectedElement = {
        tagName: element.tagName || 'unknown',
        role: element.getAttribute?.('role') || null,
        id: element.id || null,
        className: element.className || null,
        name: element.getAttribute?.('name') || null,
        type: element.getAttribute?.('type') || null,
        ariaLabel: element.getAttribute?.('aria-label') || null,
        ariaDescription: element.getAttribute?.('aria-description') || null,
        placeholder: element.getAttribute?.('placeholder') || null,
        text: (element.textContent || '').trim().slice(0, 500) || null,
        value: element.value !== undefined ? String(element.value).slice(0, 200) : null,
      };

      const boundingRect = rect ? { ...rect.toJSON?.(), x: rect.x, y: rect.y } : null;
      const clickPoint = rect
        ? {
            x: rect.left + viewportX + rect.width / 2,
            y: rect.top + viewportY + rect.height / 2,
          }
        : { x, y };

      return { success: true, detectedElement, boundingRect, clickPoint };
    },
    args: [{ x: Number(point.x), y: Number(point.y) }],
  });

  return result;
}
