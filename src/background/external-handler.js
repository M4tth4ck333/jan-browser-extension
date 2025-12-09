// external-handler.js
// Handles external connections from websites via externally_connectable
// Allowed domains are configured in manifest.json under "externally_connectable"
// Always accepts connections (no mode restriction)

import { dispatchToolCall } from '../mcp-tools/index.js';
import { MessageTypes } from '../constants.js';

// Extension version (loaded from manifest)
let extensionVersion = '0.0.0';
try {
  extensionVersion = chrome.runtime.getManifest().version;
} catch (_) {}

// Track connected web clients
/** @type {Set<chrome.runtime.Port>} */
const connectedPorts = new Set();

/**
 * Get current web connection status
 * @returns {{ connected: boolean, count: number }}
 */
export function getWebStatus() {
  return {
    connected: connectedPorts.size > 0,
    count: connectedPorts.size,
  };
}

/**
 * Broadcast web status update to popup
 */
function broadcastWebStatus() {
  const status = getWebStatus();
  chrome.runtime.sendMessage({
    type: MessageTypes.WEB_STATUS_UPDATED,
    payload: status,
  }).catch(() => {
    // Popup may not be open, ignore
  });
}

/**
 * Handle port connection from external website
 * @param {chrome.runtime.Port} port
 */
function handleExternalConnect(port) {
  const origin = port.sender?.origin;
  const tabId = port.sender?.tab?.id;

  console.log('[External Handler] Connection from:', origin, 'tab:', tabId);

  // Track this connection
  connectedPorts.add(port);
  broadcastWebStatus();

  // Handle incoming messages
  port.onMessage.addListener(async (message) => {
    // Handle ping for detection
    if (message?.kind === 'ping') {
      port.postMessage({
        kind: 'pong',
        version: extensionVersion,
      });
      return;
    }

    // Handle tool calls
    if (message?.kind === 'call') {
      const { id, tool, params } = message;

      if (!id || !tool) {
        port.postMessage({
          kind: 'result',
          id: id || 'unknown',
          ok: false,
          error: 'Invalid message: missing id or tool',
        });
        return;
      }

      try {
        const result = await dispatchToolCall(tool, params || {});
        port.postMessage({
          kind: 'result',
          id,
          ...result,
        });
      } catch (error) {
        port.postMessage({
          kind: 'result',
          id,
          ok: false,
          error: String(error?.message || error),
        });
      }
    }
  });

  // Handle disconnect
  port.onDisconnect.addListener(() => {
    console.log('[External Handler] Connection closed from:', origin);
    connectedPorts.delete(port);
    broadcastWebStatus();
  });
}

/**
 * Handle one-shot message from external website (for ping detection)
 * @param {object} message
 * @param {chrome.runtime.MessageSender} sender
 * @param {function} sendResponse
 * @returns {boolean}
 */
function handleExternalMessage(message, _sender, sendResponse) {
  // Handle ping for detection
  if (message?.kind === 'ping') {
    sendResponse({
      kind: 'pong',
      version: extensionVersion,
    });
    return false;
  }

  // Handle tool calls via one-shot message
  if (message?.kind === 'call') {
    const { id, tool, params } = message;

    dispatchToolCall(tool, params || {})
      .then((result) => {
        sendResponse({
          kind: 'result',
          id,
          ...result,
        });
      })
      .catch((error) => {
        sendResponse({
          kind: 'result',
          id,
          ok: false,
          error: String(error?.message || error),
        });
      });

    return true; // Async response
  }

  return false;
}

// Listen for external port connections
chrome.runtime.onConnectExternal.addListener(handleExternalConnect);

// Listen for one-shot external messages
chrome.runtime.onMessageExternal.addListener(handleExternalMessage);
