// automation.js
// MCP Bridge automation tools: click, type, hover, fill_form, select_option, execute_script

import { selectTab } from '../lib/tab-manager.js';
import { TAB_REGISTRATION_DELAY } from '../constants.js';
import { captureSnapshotResponse, createErrorResult } from './snapshot-utils.js';

/**
 * Executes arbitrary JavaScript in the selected tab
 */
export async function handleExecuteScript(params) {
  const script = String(params?.script || '').trim();

  if (!script) {
    return createErrorResult('Execute script failed', 'Missing script parameter');
  }

  console.log('[MCP Tools] execute_script', { scriptLength: script.length });

  try {
    const selection = await selectTab({ toolName: 'execute_script' });
    if (!selection.ok) {
      return createErrorResult('Execute script failed', selection.error);
    }

    const { tabId, tab } = selection;

    const args = Array.isArray(params?.args) ? params.args : [];
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: new Function('args', script),
      args: [args],
    });

    console.log('[MCP Tools] script executed', { url: tab.url, resultType: typeof result });

    const meta = {};
    if (tab?.url) meta.urls = [tab.url];
    if (typeof tabId === 'number') meta.tabId = tabId;

    const text = `Script executed successfully on ${tab?.url || 'current page'}.` +
      `\n\nResult:\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      data: {
        url: tab.url,
        result,
        timestamp: new Date().toISOString(),
        tabId,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] execute_script error:', e);
    return createErrorResult('Execute script failed', e);
  }
}

/**
 * Clicks an element with comprehensive mouse event simulation
 */
export async function handleClickElement(params) {
  const selector = String(params?.selector || '').trim();

  if (!selector) {
    return createErrorResult('Click failed', 'Missing selector parameter');
  }

  const waitForNavigation = params?.waitForNavigation !== false; // default true

  console.log('[MCP Tools] click_element', { selector, waitForNavigation });

  try {
    const selection = await selectTab({ toolName: 'click_element' });
    if (!selection.ok) {
      return createErrorResult('Click failed', selection.error);
    }

    const { tabId } = selection;

    const beforeTab = await chrome.tabs.get(tabId);
    const originalUrl = beforeTab.url;

    const [{ result: clicked }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel) => {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: 'Element not found' };

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

        if (el.focus) {
          el.focus();
        }

        el.dispatchEvent(new MouseEvent('mouseup', mouseEventOptions));
        el.dispatchEvent(new MouseEvent('click', { ...mouseEventOptions, detail: 1 }));

        try {
          el.click();
        } catch (e) {
          // ignore
        }

        el.dispatchEvent(new PointerEvent('pointerdown', mouseEventOptions));
        el.dispatchEvent(new PointerEvent('pointerup', mouseEventOptions));

        return { success: true, element: el.tagName, focused: document.activeElement === el };
      },
      args: [selector],
    });

    if (!clicked.success) {
      return createErrorResult('Click failed', clicked.error || 'Click failed');
    }

    if (waitForNavigation) {
      await new Promise((resolve) => setTimeout(resolve, TAB_REGISTRATION_DELAY));
    }

    const afterTab = await chrome.tabs.get(tabId);
    const finalUrl = afterTab.url;

    console.log('[MCP Tools] element clicked', { originalUrl, finalUrl, selector });

    const details = [];
    if (originalUrl && originalUrl !== finalUrl) {
      details.push(`Original URL: ${originalUrl}`);
    }
    if (finalUrl) {
      details.push(`Final URL: ${finalUrl}`);
    }

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status: `Clicked "${selector}"`,
      details,
      fallbackUrl: finalUrl,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        originalUrl,
        finalUrl,
        selector,
        clicked: true,
        timestamp: new Date().toISOString(),
        tabId,
        snapshot: snapshotResult.snapshot,
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
export async function handleFillForm(params) {
  const fields = params?.fields || [];

  if (!Array.isArray(fields) || fields.length === 0) {
    return createErrorResult('Fill form failed', 'Missing or empty fields array');
  }

  console.log('[MCP Tools] fill_form', { fieldCount: fields.length });

  try {
    const selection = await selectTab({ toolName: 'fill_form' });
    if (!selection.ok) {
      return createErrorResult('Fill form failed', selection.error);
    }

    const { tabId, tab } = selection;

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
      args: [fields],
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

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status,
      details,
      fallbackUrl: tab?.url,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    const response = {
      ok: success,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        url: tab.url,
        totalFields: fields.length,
        successfulFields: successCount,
        failedFields,
        results: fillResult,
        timestamp: new Date().toISOString(),
        tabId,
        snapshot: snapshotResult.snapshot,
      },
    };

    if (!success) {
      response.isError = true;
    }

    return response;
  } catch (e) {
    console.error('[MCP Tools] fill_form error:', e);
    return createErrorResult('Fill form failed', e);
  }
}

/**
 * Types text into an element (supports input, textarea, and contenteditable)
 */
export async function handleTypeText(params) {
  const selector = String(params?.selector || '').trim();
  const text = String(params?.text || '');
  const clear = params?.clear !== false;
  const pressEnter = params?.pressEnter === true;

  if (!selector) {
    return createErrorResult('Type text failed', 'Missing selector parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'type_text' });
    if (!selection.ok) {
      return createErrorResult('Type text failed', selection.error);
    }

    const { tabId, tab } = selection;

    const [{ result: typed }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (sel, txt, clr, pressEnter) => {
        const el = document.querySelector(sel);
        if (!el) return { success: false, error: 'Element not found' };

        el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

        const rect = el.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        el.dispatchEvent(new MouseEvent('mousedown', {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: x,
          clientY: y,
        }));
        el.focus();
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

        const isContentEditable = el.contentEditable === 'true' || el.getAttribute('contenteditable') === 'true';

        if (isContentEditable) {
          if (clr) {
            el.textContent = '';
            el.innerHTML = '';
          }

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

          for (let i = 0; i < txt.length; i++) {
            const char = txt[i];

            const beforeInputEvent = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: char,
              composed: true,
            });
            el.dispatchEvent(beforeInputEvent);

            if (document.execCommand) {
              document.execCommand('insertText', false, char);
            } else {
              const textNode = new Text(char);
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

            dispatchKey(el, 'keydown', char);
            dispatchKey(el, 'keypress', char);

            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              cancelable: false,
              inputType: 'insertText',
              data: char,
              composed: true,
            }));

            dispatchKey(el, 'keyup', char);
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
          if (clr) {
            el.value = '';
          }

          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
            'value',
          ).set;

          for (let i = 0; i < txt.length; i++) {
            const char = txt[i];
            const currentValue = el.value;
            nativeInputValueSetter.call(el, currentValue + char);

            dispatchKey(el, 'keydown', char);
            dispatchKey(el, 'keypress', char);

            el.dispatchEvent(new InputEvent('input', {
              bubbles: true,
              cancelable: false,
              inputType: 'insertText',
              data: char,
              composed: true,
            }));

            dispatchKey(el, 'keyup', char);
          }

          el.dispatchEvent(new Event('change', { bubbles: true }));

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

        return { success: false, error: 'Element is not a valid input, textarea, or contenteditable element' };
      },
      args: [selector, text, clear, pressEnter],
    });

    if (!typed.success) {
      return createErrorResult('Type text failed', typed.error || 'Typing failed');
    }

    const truncated = text.length > 80 ? `${text.slice(0, 77)}...` : text;
    const status = pressEnter
      ? `Typed "${truncated}" and pressed Enter into "${selector}"`
      : `Typed "${truncated}" into "${selector}"`;

    const details = [];
    if (typed.finalValue) {
      details.push(`Final value: ${typed.finalValue}`);
    }
    if (typed.finalContent) {
      details.push(`Final content: ${typed.finalContent}`);
    }

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status,
      details,
      fallbackUrl: tab?.url,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        url: tab.url,
        selector,
        text: text.slice(0, 200),
        clear,
        pressEnter,
        result: typed,
        timestamp: new Date().toISOString(),
        tabId,
        snapshot: snapshotResult.snapshot,
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
  const selector = String(params?.selector || '').trim();

  if (!selector) {
    return createErrorResult('Hover failed', 'Missing selector parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'hover_element' });
    if (!selection.ok) {
      return createErrorResult('Hover failed', selection.error);
    }

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
      args: [selector],
    });

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!hovered.success) {
      return createErrorResult('Hover failed', hovered.error || 'Hover failed');
    }

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status: `Hovered over "${selector}"`,
      fallbackUrl: tab?.url,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        url: tab.url,
        selector,
        timestamp: new Date().toISOString(),
        tabId,
        snapshot: snapshotResult.snapshot,
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
  const selector = String(params?.selector || '').trim();
  const value = String(params?.value || '');

  if (!selector || !value) {
    return createErrorResult('Select option failed', 'Missing selector or value parameter');
  }

  try {
    const selection = await selectTab({ toolName: 'select_option' });
    if (!selection.ok) {
      return createErrorResult('Select option failed', selection.error);
    }

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
      args: [selector, value],
    });

    if (!selected.success) {
      return createErrorResult('Select option failed', selected.error || 'Selection failed');
    }

    const snapshotResult = await captureSnapshotResponse({
      tabId,
      status: `Selected option "${selected.selectedValue}" in "${selector}"`,
      fallbackUrl: tab?.url,
    });

    if (!snapshotResult.ok) {
      return snapshotResult;
    }

    return {
      ok: true,
      content: snapshotResult.content,
      _meta: snapshotResult._meta,
      data: {
        url: tab.url,
        selector,
        value: selected.selectedValue,
        timestamp: new Date().toISOString(),
        tabId,
        snapshot: snapshotResult.snapshot,
      },
    };
  } catch (e) {
    console.error('[MCP Tools] select_option error:', e);
    return createErrorResult('Select option failed', e);
  }
}
