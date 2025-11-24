// debugger-input.js
// Human-like input helpers for driving Chrome debugger mouse and keyboard events

import { attachDebugger, detachDebugger, sendDebuggerCommand } from './snapshot-utils.js';

export const waitMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const DEFAULT_CURSOR_POSITION = { x: 400, y: 300 };
const KEY_DELAY_RANGE = { min: 24, max: 62 };
const MOUSE_BUTTON_MASK = { left: 1, right: 2, middle: 4 };

const cursorStateByTab = new Map();

const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function getCursorState(tabId) {
  if (!cursorStateByTab.has(tabId)) {
    cursorStateByTab.set(tabId, { ...DEFAULT_CURSOR_POSITION, initialized: false });
  }
  return cursorStateByTab.get(tabId);
}

function setCursorState(tabId, state) {
  cursorStateByTab.set(tabId, state);
}

async function withDebuggerSession(tabId, handler) {
  const target = { tabId };
  await attachDebugger(target);
  try {
    const send = (method, params) => sendDebuggerCommand(target, method, params);
    return await handler(send);
  } finally {
    try {
      await detachDebugger(target);
    } catch (err) {
      console.warn('[MCP Tools] Failed to detach debugger session', err);
    }
  }
}

async function driveCursorSteps(send, start, target, steps) {
  for (let i = 1; i <= steps; i++) {
    const progress = i / steps;
    const x = start.x + (target.x - start.x) * progress;
    const y = start.y + (target.y - start.y) * progress;
    await send('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x,
      y,
      button: 'none',
      buttons: 0,
      pointerType: 'mouse',
    });
    await waitMs(randomBetween(6, 14));
  }
}

export async function clickPointWithDebugger(tabId, point, options = {}) {
  if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') {
    throw new Error('Invalid cursor point');
  }

  const { steps = 12, button = 'left', clickCount = 1 } = options;
  const mask = MOUSE_BUTTON_MASK[button] ?? MOUSE_BUTTON_MASK.left;
  const state = getCursorState(tabId);
  const start = state.initialized ? state : point;

  await withDebuggerSession(tabId, async (send) => {
    await driveCursorSteps(send, start, point, steps);

    await waitMs(randomBetween(12, 28));
    await send('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: point.x,
      y: point.y,
      button,
      buttons: mask,
      pointerType: 'mouse',
      clickCount,
    });

    await waitMs(randomBetween(28, 52));
    await send('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: point.x,
      y: point.y,
      button,
      buttons: 0,
      pointerType: 'mouse',
      clickCount,
    });
  });

  setCursorState(tabId, { x: point.x, y: point.y, initialized: true });
}

const SPECIAL_KEYS = {
  Enter: { key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 },
  Backspace: { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 },
  Tab: { key: 'Tab', code: 'Tab', text: '\t', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9 },
  Escape: { key: 'Escape', code: 'Escape', text: '', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 },
  ArrowLeft: { key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37, nativeVirtualKeyCode: 37 },
  ArrowRight: { key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 },
  ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38, nativeVirtualKeyCode: 38 },
  ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40, nativeVirtualKeyCode: 40 },
  Space: { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 },
};

function normalizeKeyName(name) {
  if (!name) return '';
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  if (['ctrl', 'control', 'cmdorctrl'].includes(lower)) return 'Control';
  if (['cmd', 'meta', 'command', 'super', '⌘'].includes(lower)) return 'Meta';
  if (['alt', 'option', '⌥'].includes(lower)) return 'Alt';
  if (['shift', '⇧'].includes(lower)) return 'Shift';
  if (['enter', 'return', '↩', '⏎'].includes(lower)) return 'Enter';
  if (['esc', 'escape'].includes(lower)) return 'Escape';
  if (['space', 'spacebar'].includes(lower)) return 'Space';
  if (['tab'].includes(lower)) return 'Tab';
  if (['arrowleft', 'left'].includes(lower)) return 'ArrowLeft';
  if (['arrowright', 'right'].includes(lower)) return 'ArrowRight';
  if (['arrowup', 'up'].includes(lower)) return 'ArrowUp';
  if (['arrowdown', 'down'].includes(lower)) return 'ArrowDown';
  return trimmed;
}

function keyPayloadForChar(char) {
  const codePoint = char.codePointAt(0);
  if (char === ' ') {
    return { key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 };
  }

  if (/^[a-z]$/i.test(char)) {
    const upper = char.toUpperCase();
    return {
      key: upper === char ? char : upper,
      code: `Key${upper}`,
      text: char,
      windowsVirtualKeyCode: upper.charCodeAt(0),
      nativeVirtualKeyCode: upper.charCodeAt(0),
    };
  }

  if (/^[0-9]$/.test(char)) {
    return {
      key: char,
      code: `Digit${char}`,
      text: char,
      windowsVirtualKeyCode: 48 + Number(char),
      nativeVirtualKeyCode: 48 + Number(char),
    };
  }

  return {
    key: char,
    text: char,
    windowsVirtualKeyCode: codePoint && codePoint <= 0xffff ? codePoint : undefined,
    nativeVirtualKeyCode: codePoint && codePoint <= 0xffff ? codePoint : undefined,
  };
}

async function dispatchKey(send, payload, includeCharEvent = true) {
  const { text, unmodifiedText, ...keyPayload } = payload;
  const isTextual = includeCharEvent && Boolean(text);
  const keyDownType = isTextual ? 'rawKeyDown' : 'keyDown';

  await send('Input.dispatchKeyEvent', {
    type: keyDownType,
    ...keyPayload,
  });

  if (isTextual) {
    await send('Input.dispatchKeyEvent', {
      type: 'char',
      text,
      unmodifiedText: unmodifiedText ?? text,
      key: payload.key,
    });
  }

  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    ...keyPayload,
  });
}

async function dispatchSpecialKey(send, keyName) {
  const payload = SPECIAL_KEYS[keyName];
  if (!payload) {
    throw new Error(`Unsupported special key: ${keyName}`);
  }
  await dispatchKey(send, payload, keyName !== 'Backspace');
}

async function selectAllWithModifier(send, modifier) {
  const modifierBits = { Control: 2, Meta: 4 };
  const modifierKeyCodes = { Control: 17, Meta: 91 };
  const modifierCodes = { Control: 'ControlLeft', Meta: 'MetaLeft' };
  const modifierBit = modifierBits[modifier];
  const modifierKeyCode = modifierKeyCodes[modifier];
  const modifierCode = modifierCodes[modifier];

  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: modifier,
    code: modifierCode,
    windowsVirtualKeyCode: modifierKeyCode,
    nativeVirtualKeyCode: modifierKeyCode,
  });

  await send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'a',
    code: 'KeyA',
    text: 'a',
    unmodifiedText: 'a',
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: modifierBit,
  });

  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'a',
    code: 'KeyA',
    text: 'a',
    unmodifiedText: 'a',
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    modifiers: modifierBit,
  });

  await send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: modifier,
    code: modifierCode,
    windowsVirtualKeyCode: modifierKeyCode,
    nativeVirtualKeyCode: modifierKeyCode,
  });
}

async function clearExistingText(send) {
  for (const modifier of ['Control', 'Meta']) {
    await selectAllWithModifier(send, modifier);
    await waitMs(40);
  }
  await dispatchSpecialKey(send, 'Backspace');
  await waitMs(60);
}

export async function typeTextWithDebugger(tabId, text, options = {}) {
  const { pressEnter = false, clear = false } = options;
  const content = typeof text === 'string' ? text : String(text ?? '');
  return withDebuggerSession(tabId, async (send) => {
    if (clear) {
      await clearExistingText(send);
    }

    // Use insertText to preserve all characters (including extended/utf punctuation)
    await send('Input.insertText', { text: content });
    await waitMs(randomBetween(20, 45));

    if (pressEnter) {
      await dispatchSpecialKey(send, 'Enter');
    }

    return {
      success: true,
      typedCharacters: content.length,
      pressedEnter: pressEnter,
      cleared: clear,
    };
  });
}

export async function sendKeysWithDebugger(tabId, keys) {
  if (!Array.isArray(keys) || keys.length === 0) {
    return { success: true, pressed: 0, sequence: [] };
  }

  const sequence = keys.map((key) => normalizeKeyName(String(key)));

  return withDebuggerSession(tabId, async (send) => {
    let pressed = 0;
    for (const key of sequence) {
      if (!key) continue;

      if (SPECIAL_KEYS[key]) {
        await dispatchKey(send, SPECIAL_KEYS[key], key !== 'Backspace');
        pressed += 1;
        await waitMs(randomBetween(8, 16));
        continue;
      }

      if (key.length === 1) {
        const payload = keyPayloadForChar(key);
        await dispatchKey(send, payload);
        pressed += 1;
        await waitMs(randomBetween(8, 18));
        continue;
      }

      const payload = {
        key,
        code: key,
        text: '',
        windowsVirtualKeyCode: undefined,
        nativeVirtualKeyCode: undefined,
      };
      await send('Input.dispatchKeyEvent', { type: 'keyDown', ...payload });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', ...payload });
      pressed += 1;
      await waitMs(randomBetween(8, 18));
    }

    return { success: true, pressed, sequence };
  });
}
