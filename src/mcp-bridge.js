// mcp-bridge.js
// MCP Bridge WebSocket client for browser automation tools

import { BRIDGE_BASE, BRIDGE_RECONNECT_TIMEOUT, BRIDGE_RECONNECT_ERROR_TIMEOUT } from './constants.js';
import { dispatchToolCall } from './mcp-tools/index.js';

/**
 * WebSocket connection to MCP bridge server
 */
let bridgeSocket = null;

/**
 * Cached bridge token for change detection
 */
let lastBridgeToken = null;

/**
 * Cached flag for whether to use the token
 */
let lastUseBridgeToken = false;

/**
 * Gets the current bridge connection status
 * @returns {{connected: boolean, socket: WebSocket|null}}
 */
export function getBridgeStatus() {
  return {
    connected: bridgeSocket?.readyState === WebSocket.OPEN,
    socket: bridgeSocket
  };
}

/**
 * Gets the current bridge socket
 * @returns {WebSocket|null}
 */
export function getBridgeSocket() {
  return bridgeSocket;
}

/**
 * Closes the bridge connection
 */
export function closeBridge() {
  try {
    if (bridgeSocket) {
      bridgeSocket.close();
      bridgeSocket = null;
    }
  } catch (e) {
    console.warn('[MCP Bridge] Error closing socket:', e);
  }
}

/**
 * Connects to the MCP bridge WebSocket server
 * @param {object} context - Context object containing search functions and other dependencies
 */
export async function connectMcpBridge(context = {}) {
  try {
    // Read optional shared secret for the local bridge
    const { bridgeToken, useBridgeToken } = await chrome.storage.sync.get(['bridgeToken', 'useBridgeToken']);
    lastBridgeToken = bridgeToken || null;
    lastUseBridgeToken = !!useBridgeToken;
    const include = !!bridgeToken && !!useBridgeToken;
    const url = include ? `${BRIDGE_BASE}?t=${encodeURIComponent(bridgeToken)}` : BRIDGE_BASE;
    const ws = new WebSocket(url);
    bridgeSocket = ws;

    ws.addEventListener('open', () => {
      try {
        console.log('[MCP Bridge] connected');
      } catch (_) {}
    });

    ws.addEventListener('message', async (evt) => {
      let msg;
      try {
        msg = JSON.parse(evt.data);
      } catch (_) {
        return;
      }

      if (!msg || msg.kind !== 'call') return;

      const { id, tool, params } = msg;
      try {
        console.log('[MCP Bridge] call received', { id, tool, params });
      } catch (_) {}

      if (!id) return;

      // Reply helper
      const reply = (payload) => {
        try {
          console.log('[MCP Bridge] sending reply', { id, ok: payload?.ok, keys: Object.keys(payload || {}) });
          ws.send(JSON.stringify({ id, kind: 'result', ...payload }));
        } catch (e) {
          console.error('[MCP Bridge] Failed to send reply:', e);
        }
      };

      try {
        // Dispatch to the appropriate tool handler
        const result = await dispatchToolCall(tool, params, context);
        reply(result);
      } catch (e) {
        console.error('[MCP Bridge] Tool execution error:', e);
        reply({ ok: false, error: String(e?.message || e) });
      }
    });

    ws.addEventListener('close', () => {
      try {
        console.warn('[MCP Bridge] disconnected, retrying...');
      } catch (_) {}
      bridgeSocket = null;
      setTimeout(() => connectMcpBridge(context), BRIDGE_RECONNECT_TIMEOUT);
    });

    ws.addEventListener('error', () => {
      try {
        ws.close();
      } catch (_) {}
    });
  } catch (e) {
    try {
      console.warn('[MCP Bridge] connect error:', e);
    } catch (_) {}
    setTimeout(() => connectMcpBridge(context), BRIDGE_RECONNECT_ERROR_TIMEOUT);
  }
}

/**
 * Sets up storage listener to reconnect when token changes
 */
export function setupBridgeTokenListener() {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') return;

      let shouldReconnect = false;

      if (Object.prototype.hasOwnProperty.call(changes, 'bridgeToken')) {
        const next = changes.bridgeToken?.newValue || null;
        if (next !== lastBridgeToken) {
          lastBridgeToken = next;
          shouldReconnect = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(changes, 'useBridgeToken')) {
        const nextUse = !!changes.useBridgeToken?.newValue;
        if (nextUse !== lastUseBridgeToken) {
          lastUseBridgeToken = nextUse;
          shouldReconnect = true;
        }
      }

      if (shouldReconnect) {
        try {
          console.log('[MCP Bridge] Token changed, reconnecting...');
          if (bridgeSocket) {
            bridgeSocket.close();
          }
        } catch (_) {}
      }
    });
  } catch (e) {
    console.warn('[MCP Bridge] Failed to setup token listener:', e);
  }
}

/**
 * Initializes the MCP bridge connection and listeners
 * @param {object} context - Context object containing search functions and other dependencies
 */
export function initializeMcpBridge(context = {}) {
  connectMcpBridge(context);
  setupBridgeTokenListener();
}
