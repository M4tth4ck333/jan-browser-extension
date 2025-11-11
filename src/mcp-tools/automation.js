// automation.js
// MCP Bridge automation tools: click, type, hover, fill_form, select_option, press_key, drag

import { selectTab } from '../lib/tab-manager.js';
import { TAB_REGISTRATION_DELAY } from '../constants.js';
import { createErrorResult } from './snapshot-utils.js';
import { getElementSelector } from '../lib/element-ref-map.js';

/**
 * Helper function to resolve accessibility refs to CSS selectors
 * @param {string} ref - The reference ID (e.g., "s1e14")
 * @param {number} tabId - The tab ID
 * @returns {string} The resolved reference (CSS selector if found, original ref otherwise)
 */
function resolveAccessibilityRef(ref, tabId) {
  if (!ref || !/^s\d+e\d+$/i.test(ref)) {
    return ref; // Not an accessibility ref, return as-is
  }

  const mappedSelector = getElementSelector(tabId, ref);

  if (mappedSelector) {
    return mappedSelector;
  } else {
    console.warn('[MCP Tools] Could not resolve accessibility ref:', ref);
    console.warn('[MCP Tools] Try capturing a fresh snapshot first');
    return ref; // Return original ref as fallback
  }
}

/**
 * Executes arbitrary JavaScript in the selected tab
 */
/**
 * Clicks an element with comprehensive mouse event simulation
 */
export async function handleClickElement(params) {
  const ref = typeof params?.ref === 'string' ? params.ref.trim() : '';
  let selector = String(params?.selector || '').trim();

  if (!ref && !selector) {
    return createErrorResult('Click failed', 'Missing element ref or selector parameter');
  }

  const waitForNavigation = params?.waitForNavigation !== false; // default true

  console.log('[MCP Tools] click_element', { ref, selector, waitForNavigation });

  try {
    const selection = await selectTab({ toolName: 'click_element' });
    if (!selection.ok) {
      return createErrorResult('Click failed', selection.error);
    }

    const { tabId } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedRef = resolveAccessibilityRef(ref, tabId);

    const beforeTab = await chrome.tabs.get(tabId);
    const originalUrl = beforeTab.url;

    const [{ result: clicked }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ sel, ref }) => {
        const resolveElementFromRef = (reference) => {
          if (typeof reference !== 'string' || reference.length === 0) {
            return null;
          }

          // Handle Shadow DOM references (format: css:host##shadow-selector##nested)
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

          // Regular CSS selector
          if (reference.startsWith('css:')) {
            const selectorText = reference.slice(4);
            if (!selectorText) return null;
            try {
              return document.querySelector(selectorText);
            } catch (err) {
              return null;
            }
          }

          // Fallback: Try various reference formats
          try {
            let element = document.querySelector(`[data-aria-id="${reference}"]`);
            if (element) return element;

            element = document.getElementById(reference);
            if (element) return element;

            element = document.querySelector(reference);
            if (element) return element;
          } catch (err) {
            // Ignore
          }

          return null;
        };

        // Smart Element Detection: Find the actual clickable element
        const findClickableElement = (element) => {
          if (!element) return null;

          // If element is already a known clickable type, return it
          const clickableTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'LABEL'];
          if (clickableTags.includes(element.tagName)) return element;

          // Check if element has click-related attributes/roles
          const role = element.getAttribute('role');
          const hasClickRole = role === 'button' || role === 'link' || role === 'menuitem' ||
                               role === 'tab' || role === 'checkbox' || role === 'radio' || role === 'href';

          const hasClickable = element.hasAttribute('onclick') || element.style.cursor === 'pointer' ||
                              element.hasAttribute('data-action') || element.hasAttribute('data-click');

          if (hasClickRole || hasClickable) return element;

          // Check for framework-specific event handlers
          const elementKeys = Object.keys(element);
          const hasReactProps = elementKeys.some(key =>
            key.startsWith('__reactProps') || key.startsWith('__reactFiber') || key.startsWith('__reactInternalInstance')
          );
          const hasVueProps = element.__vue__ || element.__vueParentComponent;
          const hasAngular = element.hasAttribute('ng-click') || element.hasAttribute('(click)');

          if (hasReactProps || hasVueProps || hasAngular) return element;

          // Search for clickable child elements
          const clickableChild = element.querySelector('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]');
          if (clickableChild) return clickableChild;

          // Search within shadow DOM if present
          if (element.shadowRoot) {
            const shadowClickable = element.shadowRoot.querySelector('button, a, [role="button"], [role="link"], input[type="button"], input[type="submit"]');
            if (shadowClickable) return shadowClickable;
          }

          // Check iframes (limited support - same-origin only)
          if (element.tagName === 'IFRAME') {
            try {
              const iframeDoc = element.contentDocument || element.contentWindow?.document;
              if (iframeDoc) return iframeDoc.body;
            } catch (err) {
              // Ignore cross-origin errors
            }
          }

          // If element has a single child, check if it's clickable
          const children = Array.from(element.children);
          if (children.length === 1) {
            const childResult = findClickableElement(children[0]);
            if (childResult && childResult !== children[0]) return childResult;
          }

          // Return original element as fallback (might have delegated event listeners)
          return element;
        };

        // Try resolving from ref first
        let el = ref ? resolveElementFromRef(ref) : null;

        // Fallback to selector if ref didn't work
        if (!el && sel) {
          try {
            el = document.querySelector(sel);
          } catch (err) {
            // Ignore query errors
          }
        }

        if (!el) {
          return { success: false, error: 'Element not found' };
        }

        // Apply smart element detection
        const originalEl = el;
        el = findClickableElement(el);

        if (!el) {
          return { success: false, error: 'Could not find clickable element' };
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        const mouseEventOptions = {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
          screenX: x,
          screenY: y,
          button: 0,
          buttons: 1,
          composed: true,
        };

        el.dispatchEvent(new MouseEvent('mouseover', mouseEventOptions));
        el.dispatchEvent(new MouseEvent('mouseenter', { ...mouseEventOptions, bubbles: false }));
        el.dispatchEvent(new MouseEvent('mousemove', mouseEventOptions));
        el.dispatchEvent(new MouseEvent('mousedown', mouseEventOptions));

        if (el.focus) el.focus();

        el.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
        el.dispatchEvent(new MouseEvent('click', { ...mouseEventOptions, detail: 1 }));

        try {
          el.click();
        } catch (e) {
          // Ignore click errors
        }

        el.dispatchEvent(new PointerEvent('pointerdown', mouseEventOptions));
        el.dispatchEvent(new PointerEvent('pointerup', mouseEventOptions));

        const smartDetectionUsed = originalEl !== el;
        return {
          success: true,
          element: el.tagName,
          focused: document.activeElement === el,
          smartDetection: smartDetectionUsed,
          detectedElement: smartDetectionUsed ? `${el.tagName}${el.id ? '#' + el.id : ''}${el.className ? '.' + el.className.split(' ')[0] : ''}` : null
        };
      },
      args: [{ sel: selector, ref: resolvedRef }],
    });

    if (!clicked.success) {
      return createErrorResult('Click failed', clicked.error || 'Click failed');
    }

    if (waitForNavigation) {
      await new Promise((resolve) => setTimeout(resolve, TAB_REGISTRATION_DELAY));
    }

    const afterTab = await chrome.tabs.get(tabId);
    const finalUrl = afterTab.url;

    if (clicked.smartDetection) {
      console.log('[MCP Tools] element clicked (smart detection used)', {
        originalUrl,
        finalUrl,
        selector,
        detectedElement: clicked.detectedElement
      });
    } else {
      console.log('[MCP Tools] element clicked', { originalUrl, finalUrl, selector });
    }

    const meta = {};
    if (finalUrl) meta.urls = [finalUrl];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Clicked "${params?.element || selector || ref || 'target element'}"`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        originalUrl,
        finalUrl,
        selector,
        ref,
        clicked: true,
        smartDetection: clicked.smartDetection || false,
        detectedElement: clicked.detectedElement || null,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] click_element error:', e);
    return createErrorResult('Click failed', e);
  }
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
    const resolvedFields = fields.map(field => ({
      ...field,
      ref: field.ref ? resolveAccessibilityRef(field.ref, tabId) : field.ref,
    }));

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

/**
 * Types text into an element (supports input, textarea, and contenteditable)
 */
export async function handleTypeText(params) {
  const ref = typeof params?.ref === 'string' ? params.ref.trim() : '';
  const selector = String(params?.selector || '').trim();
  const text = String(params?.text || '');
  const clear = params?.clear !== false;
  const pressEnter = params?.pressEnter === true;

  if (!ref && !selector) {
    return createErrorResult('Type text failed', 'Missing element ref or selector parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'type_text' });
    if (!selection.ok) {
      return createErrorResult('Type text failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedRef = resolveAccessibilityRef(ref, tabId);

    const [{ result: typed }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ sel, ref, txt, clr, pressEnter }) => {
        const resolveElementFromRef = (reference) => {
          if (typeof reference !== 'string' || reference.length === 0) return null;

          // Handle Shadow DOM references (format: css:host##shadow-selector##nested)
          if (reference.includes('##')) {
            const parts = reference.split('##');

            // First part should be the host element (css:...)
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

            // Traverse through shadow DOMs
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

        let el = resolveElementFromRef(ref) || (sel ? document.querySelector(sel) : null);
        if (!el) return { success: false, error: 'Element not found' };

        // Smart element detection - find the actual typeable element
        // Some divs with role="textbox" contain an actual input inside
        const actualInput = el.querySelector('input, textarea, [contenteditable="true"]');
        if (actualInput && (actualInput.tagName === 'INPUT' || actualInput.tagName === 'TEXTAREA' || actualInput.contentEditable === 'true')) {
          el = actualInput;
        }

        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // Simulate realistic mouse interaction
        el.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
        }));

        // Focus with multiple strategies
        el.focus();

        // For contenteditable, also try clicking
        if (el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true') {
          el.click();
        }

        el.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
        }));

        function dispatchKey(element, type, char) {
          const keyCode = char.charCodeAt(0);
          const code = char.length === 1 && char.match(/[a-zA-Z]/) ? `Key${char.toUpperCase()}` : char;

          element.dispatchEvent(new KeyboardEvent(type, {
            key: char,
            code,
            keyCode,
            which: keyCode,
            charCode: type === 'keypress' ? keyCode : 0,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window,
          }));
        }

        // Smart input detection
        const isContentEditable = el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true';
        const isQuillEditor = el.classList.contains('ql-editor') || el.closest('.ql-container') !== null;
        const isTinyMCE = el.classList.contains('tox-edit-area') || el.id?.includes('tinymce');
        const hasRoleTextbox = el.getAttribute('role') === 'textbox';
        const isRichEditor = isQuillEditor || isTinyMCE || (isContentEditable && hasRoleTextbox);

        // Handle rich text editors (Quill, TinyMCE, etc.) or contenteditable with special care
        if (isContentEditable || isRichEditor) {
          // Clear existing content if requested
          if (clr) {
            el.textContent = '';
            el.innerHTML = '';

            // For Quill editors, also clear the internal structure
            if (isQuillEditor) {
              el.innerHTML = '<p><br></p>';
            }
          }

          // Focus the element first
          el.focus();

          // Set up selection at the end of content
          const selection = window.getSelection();
          const range = document.createRange();

          if (el.childNodes.length > 0) {
            const lastNode = el.childNodes[el.childNodes.length - 1];
            range.setStartAfter(lastNode);
            range.setEndAfter(lastNode);
          } else {
            range.selectNodeContents(el);
            range.collapse(false);
          }

          selection.removeAllRanges();
          selection.addRange(range);

          // Type character by character with proper events
          for (let i = 0; i < txt.length; i++) {
            const char = txt[i];

            // Dispatch beforeinput event (cancellable)
            const beforeInputEvent = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: char,
              composed: true,
            });
            el.dispatchEvent(beforeInputEvent);

            if (!beforeInputEvent.defaultPrevented) {
              // Keyboard events before text insertion
              dispatchKey(el, 'keydown', char);
              dispatchKey(el, 'keypress', char);

              // Try execCommand first (works with most rich editors)
              let inserted = false;
              if (document.execCommand) {
                try {
                  inserted = document.execCommand('insertText', false, char);
                } catch (e) {
                  inserted = false;
                }
              }

              // Fallback to manual DOM manipulation
              if (!inserted) {
                const textNode = document.createTextNode(char);
                const sel = window.getSelection();
                if (sel && sel.rangeCount > 0) {
                  const currentRange = sel.getRangeAt(0);
                  currentRange.deleteContents();
                  currentRange.insertNode(textNode);
                  currentRange.setStartAfter(textNode);
                  currentRange.setEndAfter(textNode);
                  sel.removeAllRanges();
                  sel.addRange(currentRange);
                } else {
                  // Last resort: append to element
                  if (el.lastChild && el.lastChild.nodeName === 'P') {
                    el.lastChild.appendChild(textNode);
                  } else {
                    el.appendChild(textNode);
                  }
                }
              }

              // Dispatch input event (non-cancellable)
              el.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                cancelable: false,
                inputType: 'insertText',
                data: char,
                composed: true,
              }));

              // Keyboard up event
              dispatchKey(el, 'keyup', char);
            }
          }

          el.dispatchEvent(new Event('change', { bubbles: true }));

          if (pressEnter) {
            dispatchKey(el, 'keydown', 'Enter');
            if (document.execCommand) {
              document.execCommand('insertLineBreak', false, null);
            }
            dispatchKey(el, 'keypress', 'Enter');
            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertLineBreak',
              composed: true,
            }));
            dispatchKey(el, 'keyup', 'Enter');
          }

          return {
            success: true,
            type: 'contenteditable',
            pressedEnter: pressEnter,
            finalContent: el.textContent.slice(0, 100),
          };
        }

        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          // Detect React/framework
          const isReact = Object.keys(el).some(key =>
            key.startsWith('__reactFiber') ||
            key.startsWith('__reactProps') ||
            key.startsWith('__reactInternalInstance')
          );
          const isVue = el.__vue__ || el.__vueParentComponent || el._value !== undefined;

          if (clr) {
            el.value = '';
          }

          // Get native setter to bypass framework getters/setters
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
            'value',
          )?.set;

          if (!nativeInputValueSetter) {
            return { success: false, error: 'Could not find native value setter' };
          }

          // Type character by character
          for (let i = 0; i < txt.length; i++) {
            const char = txt[i];
            const currentValue = el.value;

            // Set value using native setter (bypasses React/Vue)
            nativeInputValueSetter.call(el, currentValue + char);

            // Dispatch keyboard events
            dispatchKey(el, 'keydown', char);
            dispatchKey(el, 'keypress', char);

            // Dispatch input event - critical for React/Vue
            const inputEvent = new InputEvent('input', {
              bubbles: true,
              cancelable: false,
              inputType: 'insertText',
              data: char,
              composed: true,
            });

            // For React, ensure the event has a proper target
            if (isReact) {
              Object.defineProperty(inputEvent, 'target', {
                writable: false,
                value: el
              });
              Object.defineProperty(inputEvent, 'currentTarget', {
                writable: false,
                value: el
              });
            }

            el.dispatchEvent(inputEvent);

            dispatchKey(el, 'keyup', char);
          }

          // Final change event
          const changeEvent = new Event('change', { bubbles: true });
          if (isReact) {
            Object.defineProperty(changeEvent, 'target', {
              writable: false,
              value: el
            });
          }
          el.dispatchEvent(changeEvent);

          if (pressEnter) {
            dispatchKey(el, 'keydown', 'Enter');
            dispatchKey(el, 'keypress', 'Enter');
            if (el.form && el.tagName === 'INPUT') {
              el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
            dispatchKey(el, 'keyup', 'Enter');
          }

          return {
            success: true,
            type: el.tagName.toLowerCase(),
            pressedEnter: pressEnter,
            finalValue: el.value.slice(0, 100),
          };
        }

        // Last resort: check if element has any text input characteristics
        const hasTextboxRole = el.getAttribute('role') === 'textbox';
        const hasTabIndex = el.hasAttribute('tabindex');
        const looksLikeInput = hasTextboxRole || hasTabIndex;

        if (looksLikeInput) {
          // Try to set textContent directly for non-standard elements
          if (clr) {
            el.textContent = '';
            el.innerHTML = '';
          }

          el.focus();

          // Dispatch events as if it's contenteditable
          for (let i = 0; i < txt.length; i++) {
            const char = txt[i];

            dispatchKey(el, 'keydown', char);
            dispatchKey(el, 'keypress', char);

            // Try to insert text
            const textNode = document.createTextNode(char);
            if (el.lastChild && el.lastChild.nodeType === Node.TEXT_NODE) {
              el.lastChild.textContent += char;
            } else {
              el.appendChild(textNode);
            }

            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertText',
              data: char,
            }));

            dispatchKey(el, 'keyup', char);
          }

          el.dispatchEvent(new Event('change', { bubbles: true }));

          return {
            success: true,
            type: 'custom-input',
            pressedEnter: pressEnter,
            finalContent: el.textContent.slice(0, 100),
          };
        }

        return { success: false, error: 'Element is not a valid input, textarea, or contenteditable element' };
      },
      args: [{ sel: selector, ref: resolvedRef, txt: text, clr: clear, pressEnter }],
    });

    if (!typed.success) {
      return createErrorResult('Type text failed', typed.error || 'Typing failed');
    }

    const truncated = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    const targetLabel = params?.element || selector || ref || 'target element';
    const status = pressEnter
      ? `Typed "${truncated}" and pressed Enter into "${targetLabel}"`
      : `Typed "${truncated}" into "${targetLabel}"`;

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
        selector,
        ref,
        text: text.slice(0, 200),
        clear,
        pressEnter,
        result: typed,
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
  const selector = String(params?.selector || '').trim();

  if (!ref && !selector) {
    return createErrorResult('Hover failed', 'Missing element ref or selector parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'hover_element' });
    if (!selection.ok) {
      return createErrorResult('Hover failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedRef = resolveAccessibilityRef(ref, tabId);

    const [{ result: hovered }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ sel, ref }) => {
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

        const el = resolveElementFromRef(ref) || (sel ? document.querySelector(sel) : null);
        if (!el) return { success: false, error: 'Element not found' };
        const event = new MouseEvent('mouseover', { bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return { success: true };
      },
      args: [{ sel: selector, ref: resolvedRef }],
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
      text: `Hovered over "${params?.element || selector || ref || 'target element'}"`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        selector,
        ref,
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
  const selector = String(params?.selector || '').trim();
  const values = Array.isArray(params?.values) && params.values.length > 0
    ? params.values.map((val) => String(val))
    : (params?.value ? [String(params.value)] : []);

  if ((!ref && !selector) || values.length === 0) {
    return createErrorResult('Select option failed', 'Missing element ref/selector or values parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'select_option' });
    if (!selection.ok) {
      return createErrorResult('Select option failed', selection.error);
    }

    const { tabId, tab } = selection;

    // Resolve accessibility refs to CSS selectors
    const resolvedRef = resolveAccessibilityRef(ref, tabId);

    const [{ result: selected }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: ({ sel, ref, vals }) => {
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

        const el = resolveElementFromRef(ref) || (sel ? document.querySelector(sel) : null);
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
      args: [{ sel: selector, ref, vals: values }],
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
          text: `Selected option in "${params?.element || selector || ref || 'target element'}"`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        selector,
        ref,
        values,
        result: selected,
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

        return { success: true, tagName: target.tagName || 'BODY' };
      },
      args: [key],
    });

    if (!result?.success) {
      return createErrorResult('Press key failed', result?.error || 'Key dispatch failed');
    }

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text: `Pressed key ${key}`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab?.url,
        key,
        target: result.tagName,
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
    const resolvedStartRef = resolveAccessibilityRef(startRef, tabId);
    const resolvedEndRef = resolveAccessibilityRef(endRef, tabId);

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
      args: [{ startParams: { ref: resolvedStartRef, selector: fromSelector }, endParams: { ref: resolvedEndRef, selector: toSelector } }],
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
          text: `Dragged "${params?.startElement || fromSelector || startRef || 'start element'}" to "${params?.endElement || toSelector || endRef || 'end element'}"`,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab?.url,
        fromSelector,
        toSelector,
        startRef,
        endRef,
        startTag: result.startTag,
        endTag: result.endTag,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] drag_element error:', e);
    return createErrorResult('Drag failed', e);
  }
}
