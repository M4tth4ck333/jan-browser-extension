// automation.js
// MCP Bridge automation tools: click, type, hover, fill_form, select_option, execute_script

import { selectTab } from '../lib/tab-manager.js';
import { TAB_REGISTRATION_DELAY } from '../constants.js';

/**
 * Executes arbitrary JavaScript in the selected tab
 */
export async function handleExecuteScript(params) {
  const script = String(params?.script || '').trim();

  if (!script) {
    return { ok: false, error: 'Missing script parameter' };
  }

  console.log('[MCP Tools] execute_script', { scriptLength: script.length });

  try {
    const selection = await selectTab({ toolName: 'execute_script' });
    if (!selection.ok) return selection;

    const { tabId, tab } = selection;

    // Execute the script
    const args = params?.args || [];
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: new Function('args', script),
      args: [args]
    });

    console.log('[MCP Tools] script executed', { url: tab.url, resultType: typeof result });

    return {
      ok: true,
      data: {
        url: tab.url,
        result: result,
        timestamp: new Date().toISOString()
      }
    };
  } catch (e) {
    console.error('[MCP Tools] execute_script error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Clicks an element with comprehensive mouse event simulation
 */
export async function handleClickElement(params) {
  const selector = String(params?.selector || '').trim();

  if (!selector) {
    return { ok: false, error: 'Missing selector parameter' };
  }

  const waitForNavigation = params?.waitForNavigation !== false; // default true

  console.log('[MCP Tools] click_element', { selector, waitForNavigation });

  try {
    const selection = await selectTab({ toolName: 'click_element' });
    if (!selection.ok) return selection;

    const { tabId } = selection;

    // Get current URL before clicking
    const beforeTab = await chrome.tabs.get(tabId);
    const originalUrl = beforeTab.url;

    // Click the element with comprehensive event simulation
    const [{ result: clicked }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: 'Element not found' };

        // Scroll element into view smoothly
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        // Get element position for accurate event coordinates
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;

        // Create comprehensive mouse event options
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
          composed: true
        };

        // Full mouse interaction sequence
        el.dispatchEvent(new MouseEvent('mouseover', mouseEventOptions));
        el.dispatchEvent(new MouseEvent('mouseenter', { ...mouseEventOptions, bubbles: false }));
        el.dispatchEvent(new MouseEvent('mousemove', mouseEventOptions));
        el.dispatchEvent(new MouseEvent('mousedown', mouseEventOptions));

        // Focus the element
        if (el.focus) {
          el.focus();
        }

        // Complete the click sequence
        el.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
        el.dispatchEvent(new MouseEvent('click', { ...mouseEventOptions, detail: 1 }));

        // Trigger native click for maximum compatibility
        try {
          el.click();
        } catch (e) {
          // Some elements may not support native click
        }

        // Trigger pointer events for modern frameworks
        el.dispatchEvent(new PointerEvent('pointerdown', mouseEventOptions));
        el.dispatchEvent(new PointerEvent('pointerup', mouseEventOptions));

        return { success: true, element: el.tagName, focused: document.activeElement === el };
      },
      args: [selector]
    });

    if (!clicked.success) {
      return { ok: false, error: clicked.error || 'Click failed' };
    }

    // Wait for navigation if requested
    if (waitForNavigation) {
      await new Promise((resolve) => setTimeout(resolve, TAB_REGISTRATION_DELAY));
    }

    // Get the new URL after clicking
    const afterTab = await chrome.tabs.get(tabId);
    const finalUrl = afterTab.url;

    console.log('[MCP Tools] element clicked', { originalUrl, finalUrl, selector });

    return {
      ok: true,
      data: {
        originalUrl: originalUrl,
        finalUrl: finalUrl,
        selector: selector,
        clicked: true,
        timestamp: new Date().toISOString()
      }
    };
  } catch (e) {
    console.error('[MCP Tools] click_element error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Fills multiple form fields
 */
export async function handleFillForm(params) {
  const fields = params?.fields || [];

  if (!Array.isArray(fields) || fields.length === 0) {
    return { ok: false, error: 'Missing or empty fields array' };
  }

  console.log('[MCP Tools] fill_form', { fieldCount: fields.length });

  try {
    const selection = await selectTab({ toolName: 'fill_form' });
    if (!selection.ok) return selection;

    const { tabId, tab } = selection;

    // Fill the form fields
    const [{ result: fillResult }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (fieldsToFill) => {
        const results = [];
        for (const field of fieldsToFill) {
          const el = document.querySelector(field.selector);
          if (!el) {
            results.push({ selector: field.selector, success: false, error: 'Element not found' });
            continue;
          }

          // Handle different input types
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

          results.push({ selector: field.selector, success: true, value: field.value });
        }
        return results;
      },
      args: [fields]
    });

    const failedFields = fillResult.filter(r => !r.success);
    const successCount = fillResult.filter(r => r.success).length;

    console.log('[MCP Tools] form filled', { url: tab.url, successCount, failedCount: failedFields.length });

    return {
      ok: failedFields.length === 0,
      data: {
        url: tab.url,
        totalFields: fields.length,
        successfulFields: successCount,
        failedFields: failedFields,
        results: fillResult,
        timestamp: new Date().toISOString()
      }
    };
  } catch (e) {
    console.error('[MCP Tools] fill_form error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Types text into an element (supports input, textarea, and contenteditable)
 */
export async function handleTypeText(params) {
  const selector = String(params?.selector || '').trim();
  const text = String(params?.text || '');
  const clear = params?.clear !== false;

  if (!selector) {
    return { ok: false, error: 'Missing selector parameter' };
  }

  try {
    const selection = await selectTab({ toolName: 'type_text' });
    if (!selection.ok) return selection;

    const { tabId, tab } = selection;

    const [{ result: typed }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, txt, clr, pressEnter) => {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: 'Element not found' };

        // Scroll into view and focus
        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        // Click to focus properly (important for contenteditable)
        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        }));
        el.focus();
        el.dispatchEvent(new MouseEvent('mouseup', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y
        }));

        // Helper to dispatch keyboard event with proper options
        function dispatchKey(element, type, char) {
          const keyCode = char.charCodeAt(0);
          const key = char;
          const code = char.length === 1 && char.match(/[a-zA-Z]/) ? `Key${char.toUpperCase()}` : char;

          element.dispatchEvent(new KeyboardEvent(type, {
            key: key,
            code: code,
            keyCode: keyCode,
            which: keyCode,
            charCode: type === 'keypress' ? keyCode : 0,
            bubbles: true,
            cancelable: true,
            composed: true,
            view: window
          }));
        }

        // Handle contenteditable elements (Slack, Discord, Notion, etc.)
        const isContentEditable = el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true';

        if (isContentEditable) {
          // Clear existing content if requested
          if (clr) {
            el.textContent = '';
            el.innerHTML = '';
          }

          // Set focus and selection at the end
          el.focus();
          const selection = window.getSelection();
          const range = document.createRange();

          // Move cursor to end of content
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

            // Dispatch beforeinput event (modern way)
            const beforeInputEvent = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: char,
              composed: true
            });
            el.dispatchEvent(beforeInputEvent);

            // Insert the character using execCommand (works better for contenteditable)
            if (document.execCommand) {
              document.execCommand('insertText', false, char);
            } else {
              // Fallback: insert text node at cursor position
              const textNode = document.createTextNode(char);
              const sel = window.getSelection();
              if (sel.rangeCount > 0) {
                const currentRange = sel.getRangeAt(0);
                currentRange.deleteContents();
                currentRange.insertNode(textNode);
                currentRange.setStartAfter(textNode);
                currentRange.setEndAfter(textNode);
                sel.removeAllRanges();
                sel.addRange(currentRange);
              } else {
                el.appendChild(textNode);
              }
            }

            // Dispatch keyboard events
            dispatchKey(el, 'keydown', char);
            dispatchKey(el, 'keypress', char);

            // Dispatch input event (after content is inserted)
            const inputEvent = new InputEvent('input', {
              bubbles: true,
              cancelable: false,
              inputType: 'insertText',
              data: char,
              composed: true
            });
            el.dispatchEvent(inputEvent);

            dispatchKey(el, 'keyup', char);
          }

          // Dispatch change event after all typing
          el.dispatchEvent(new Event('change', { bubbles: true }));

          // Press Enter if requested
          if (pressEnter) {
            dispatchKey(el, 'keydown', 'Enter');

            // Insert line break or trigger submit
            if (document.execCommand) {
              document.execCommand('insertLineBreak', false, null);
            }

            dispatchKey(el, 'keypress', 'Enter');
            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              inputType: 'insertLineBreak',
              composed: true
            }));
            dispatchKey(el, 'keyup', 'Enter');
          }

          return {
            success: true,
            type: 'contenteditable',
            pressedEnter: pressEnter,
            finalContent: el.textContent.slice(0, 100)
          };
        }

        // Handle regular input/textarea elements
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          // Clear if requested
          if (clr) {
            el.value = '';
          }

          const startValue = el.value;

          // Use native value setter to bypass React/Vue watchers
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
            'value'
          ).set;

          // Type character by character for better compatibility
          for (let i = 0; i < txt.length; i++) {
            const char = txt[i];
            const currentValue = el.value;
            const newValue = currentValue + char;

            // Update value
            nativeInputValueSetter.call(el, newValue);

            // Dispatch keyboard events
            dispatchKey(el, 'keydown', char);
            dispatchKey(el, 'keypress', char);

            // Dispatch input event for React/Vue
            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              cancelable: false,
              inputType: 'insertText',
              data: char,
              composed: true
            }));

            dispatchKey(el, 'keyup', char);
          }

          // Dispatch change event
          el.dispatchEvent(new Event('change', { bubbles: true }));

          // Press Enter if requested
          if (pressEnter) {
            dispatchKey(el, 'keydown', 'Enter');
            dispatchKey(el, 'keypress', 'Enter');

            // For input fields in forms, submit
            if (el.form && el.tagName === 'INPUT') {
              el.form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }

            dispatchKey(el, 'keyup', 'Enter');
          }

          return {
            success: true,
            type: el.tagName.toLowerCase(),
            pressedEnter: pressEnter,
            finalValue: el.value.slice(0, 100)
          };
        }

        // Fallback for other elements
        return { success: false, error: 'Element is not a valid input, textarea, or contenteditable element' };
      },
      args: [selector, text, clear, params?.pressEnter || false]
    });

    if (!typed.success) {
      return { ok: false, error: typed.error };
    }

    return { ok: true, data: { url: tab.url, selector, text: text.slice(0, 50) } };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Hovers over an element
 */
export async function handleHoverElement(params) {
  const selector = String(params?.selector || '').trim();

  if (!selector) {
    return { ok: false, error: 'Missing selector parameter' };
  }

  try {
    const selection = await selectTab({ toolName: 'hover_element' });
    if (!selection.ok) return selection;

    const { tabId, tab } = selection;

    const [{ result: hovered }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: 'Element not found' };
        const event = new MouseEvent('mouseover', { bubbles: true, cancelable: true });
        el.dispatchEvent(event);
        return { success: true };
      },
      args: [selector]
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    if (!hovered.success) {
      return { ok: false, error: hovered.error };
    }

    return { ok: true, data: { url: tab.url, selector } };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Selects an option from a dropdown
 */
export async function handleSelectOption(params) {
  const selector = String(params?.selector || '').trim();
  const value = String(params?.value || '');

  if (!selector || !value) {
    return { ok: false, error: 'Missing selector or value parameter' };
  }

  try {
    const selection = await selectTab({ toolName: 'select_option' });
    if (!selection.ok) return selection;

    const { tabId, tab } = selection;

    const [{ result: selected }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, val) => {
        const el = document.querySelector(sel);
        if (!el || el.tagName !== 'SELECT') return { success: false, error: 'Select element not found' };
        el.value = val;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return { success: true, selectedValue: el.value };
      },
      args: [selector, value]
    });

    if (!selected.success) {
      return { ok: false, error: selected.error };
    }

    return { ok: true, data: { url: tab.url, selector, value: selected.selectedValue } };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
