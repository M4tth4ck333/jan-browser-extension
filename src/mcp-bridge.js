// mcp-bridge.js
// Single-connection MCP Bridge WebSocket client with manual connect flow and
// bounded retry logic.

import { BRIDGE_BASE, DEFAULT_BRIDGE_PORT, MessageTypes } from './constants.js';
import { dispatchToolCall } from './mcp-tools/index.js';

const DEFAULT_BASE_URL = (() => {
  try {
    return new URL(BRIDGE_BASE);
  } catch (_) {
    return new URL('ws://127.0.0.1:17389');
  }
})();

const DEFAULT_PORT = DEFAULT_BRIDGE_PORT;
const MAX_RETRY_ATTEMPTS = 10;
const RETRY_DELAY_MS = 100;

const connectionState = {
  port: DEFAULT_PORT,
  baseUrl: buildBaseUrl(DEFAULT_PORT),
  socket: null,
  status: 'idle',
  lastError: null,
  lastHandshake: null,
  lastMessageAt: null,
  retryCount: 0,
  retryTimer: null,
  allowReconnect: false,
  intentionalClose: false,
};

let currentContext = {};
let lastBridgeToken = null;
let lastUseBridgeToken = false;
let suppressPortDisconnect = false;

function buildBaseUrl(port) {
  const url = new URL(DEFAULT_BASE_URL.href);
  if (Number.isInteger(port) && port > 0) {
    url.port = String(port);
  } else if (DEFAULT_BASE_URL.port) {
    url.port = DEFAULT_BASE_URL.port;
  }
  return url.toString();
}

function sanitizePort(value) {
  if (typeof value === 'string') {
    if (!value.trim()) return null;
    const parsed = Number.parseInt(value.trim(), 10);
    if (!Number.isInteger(parsed)) return null;
    value = parsed;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const normalized = Math.trunc(value);
  if (normalized < 1 || normalized > 65535) {
    return null;
  }

  return normalized;
}

function applyPort(port) {
  const next = typeof port === 'number' && Number.isFinite(port) ? Math.trunc(port) : DEFAULT_PORT;
  if (next === connectionState.port && connectionState.baseUrl) {
    return false;
  }

  connectionState.port = next;
  connectionState.baseUrl = buildBaseUrl(next);
  return true;
}

function buildConnectionUrl() {
  const base = connectionState.baseUrl || buildBaseUrl(connectionState.port);
  if (!lastBridgeToken || !lastUseBridgeToken) {
    return base;
  }

  try {
    const url = new URL(base);
    url.searchParams.set('t', lastBridgeToken);
    return url.toString();
  } catch (_) {
    return base;
  }
}

function clearRetryTimer() {
  if (connectionState.retryTimer) {
    clearTimeout(connectionState.retryTimer);
    connectionState.retryTimer = null;
  }
}

function resetForNewSequence() {
  clearRetryTimer();
  connectionState.retryCount = 0;
  connectionState.lastError = null;
  connectionState.lastHandshake = null;
  connectionState.lastMessageAt = null;
}

function handleRetryLimitReached() {
  connectionState.socket = null;
  connectionState.status = 'error';
  if (!connectionState.lastError) {
    connectionState.lastError = 'Unable to connect to MCP bridge after multiple attempts.';
  }
  connectionState.allowReconnect = false;
  connectionState.intentionalClose = false;
  broadcastBridgeStatus();
}

function attemptConnection() {
  if (!connectionState.allowReconnect) {
    return;
  }

  if (connectionState.retryCount >= MAX_RETRY_ATTEMPTS) {
    handleRetryLimitReached();
    return;
  }

  connectionState.retryCount += 1;

  const url = buildConnectionUrl();
  let socket;
  try {
    socket = new WebSocket(url);
  } catch (error) {
    connectionState.lastError = String(error?.message || error);
    connectionState.status = 'error';
    broadcastBridgeStatus();
    scheduleRetry();
    return;
  }

  connectionState.socket = socket;
  connectionState.status = 'connecting';
  connectionState.lastError = null;
  connectionState.intentionalClose = false;
  broadcastBridgeStatus();

  socket.addEventListener('open', handleSocketOpen);
  socket.addEventListener('message', (event) => handleSocketMessage(event.data));
  socket.addEventListener('close', (event) => handleSocketClose(event));
  socket.addEventListener('error', handleSocketError);
}

function scheduleRetry() {
  if (!connectionState.allowReconnect) {
    return;
  }

  clearRetryTimer();
  connectionState.retryTimer = setTimeout(() => {
    connectionState.retryTimer = null;
    attemptConnection();
  }, RETRY_DELAY_MS);

  broadcastBridgeStatus();
}

function handleSocketOpen() {
  connectionState.status = 'connected';
  connectionState.retryCount = 0;
  connectionState.lastError = null;
  connectionState.lastMessageAt = Date.now();
  broadcastBridgeStatus();
}

function handleSocketError(event) {
  if (!connectionState.lastError) {
    const message = event?.message || 'WebSocket error';
    connectionState.lastError = String(message);
  }
  broadcastBridgeStatus();
}

function handleSocketClose(event) {
  connectionState.socket = null;
  connectionState.lastMessageAt = Date.now();
  connectionState.lastHandshake = null;

  if (connectionState.intentionalClose) {
    connectionState.status = 'idle';
    connectionState.lastError = null;
    connectionState.allowReconnect = false;
    connectionState.intentionalClose = false;
    connectionState.retryCount = 0;
    clearRetryTimer();
    broadcastBridgeStatus();
    return;
  }

  connectionState.status = 'disconnected';
  connectionState.lastError = event?.reason || connectionState.lastError;

  if (!connectionState.allowReconnect) {
    clearRetryTimer();
    broadcastBridgeStatus();
    return;
  }

  connectionState.retryCount = 0;
  scheduleRetry();
}

function handleSocketMessage(rawData) {
  connectionState.lastMessageAt = Date.now();

  let message;
  try {
    message = typeof rawData === 'string' ? JSON.parse(rawData) : JSON.parse(String(rawData));
  } catch (_) {
    return;
  }

  if (!message) {
    return;
  }

  if (message.kind === 'hello') {
    connectionState.status = 'ready';
    connectionState.lastHandshake = Date.now();
    connectionState.lastError = null;
    broadcastBridgeStatus();
    return;
  }

  if (message.kind !== 'call') {
    return;
  }

  const { id, tool, params } = message;
  if (!id) {
    return;
  }

  const socket = connectionState.socket;
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const reply = (payload) => {
    try {
      socket.send(JSON.stringify({ id, kind: 'result', ...payload }));
    } catch (error) {
      console.error('[MCP Bridge] Failed to send reply:', error);
    }
  };

  if (connectionState.status !== 'ready') {
    reply({ ok: false, error: 'Bridge is not ready.' });
    return;
  }

  dispatchToolCall(tool, params, currentContext)
    .then((result) => {
      reply(result);
    })
    .catch((error) => {
      console.error('[MCP Bridge] Tool execution error:', error);
      reply({ ok: false, error: String(error?.message || error) });
    });
}

function broadcastBridgeStatus() {
  const snapshot = getBridgeStatus();
  try {
    chrome.runtime.sendMessage(
      {
        type: MessageTypes.BRIDGE_STATUS_UPDATED,
        payload: snapshot,
      },
      () => {
        // Ignore when there are no active listeners (e.g. popup closed)
        if (chrome.runtime.lastError) {
          const message = String(chrome.runtime.lastError.message || '');
          if (!message.includes('Could not establish connection')) {
            try {
              console.warn('[MCP Bridge] Broadcast error:', message);
            } catch (_) {}
          }
        }
      },
    );
  } catch (_) {
    // Ignore when there are no active listeners (e.g. popup closed)
  }
}

export function getBridgeStatus() {
  return {
    status: connectionState.status,
    port: connectionState.port,
    url: connectionState.baseUrl,
    lastHandshake: connectionState.lastHandshake,
    lastMessageAt: connectionState.lastMessageAt,
    lastError: connectionState.lastError,
    retryCount: connectionState.retryCount,
    maxRetries: MAX_RETRY_ATTEMPTS,
    usingToken: !!(lastBridgeToken && lastUseBridgeToken),
    reconnecting: connectionState.allowReconnect && !!connectionState.retryTimer,
  };
}

export async function updateBridgePort(port, options = {}) {
  const { disconnectOnChange = true } = options;

  if (port === undefined || port === null) {
    throw new Error('Bridge port is required.');
  }

  const sanitized = sanitizePort(port);
  if (sanitized === null) {
    throw new Error('Bridge port must be between 1 and 65535.');
  }

  const changed = applyPort(sanitized);
  broadcastBridgeStatus();

  try {
    await chrome.storage.sync.set({ bridgePort: sanitized });
  } catch (error) {
    console.warn('[MCP Bridge] Failed to persist bridge port:', error);
  }

  if (changed) {
    suppressPortDisconnect = true;
    if (disconnectOnChange) {
      disconnectBridge();
    }
  }
}

export async function connectBridge(options = {}) {
  const { port } = options || {};

  if (port !== undefined) {
    await updateBridgePort(port, { disconnectOnChange: false });
  }

  if (connectionState.socket && connectionState.socket.readyState === WebSocket.OPEN) {
    connectionState.status = connectionState.lastHandshake ? 'ready' : 'connected';
    broadcastBridgeStatus();
    return;
  }

  resetForNewSequence();
  connectionState.allowReconnect = true;
  connectionState.intentionalClose = false;

  attemptConnection();
}

export function disconnectBridge() {
  connectionState.allowReconnect = false;
  connectionState.intentionalClose = true;
  clearRetryTimer();

  if (connectionState.socket) {
    try {
      connectionState.socket.close();
    } catch (_) {}
    return;
  }

  connectionState.status = 'idle';
  connectionState.lastError = null;
  connectionState.retryCount = 0;
  connectionState.intentionalClose = false;
  broadcastBridgeStatus();
}

export function closeBridge() {
  disconnectBridge();
}

function setupStorageListeners() {
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'sync') {
        return;
      }

      let shouldDisconnect = false;

      if (Object.prototype.hasOwnProperty.call(changes, 'bridgeToken')) {
        const nextToken =
          typeof changes.bridgeToken?.newValue === 'string' && changes.bridgeToken.newValue
            ? changes.bridgeToken.newValue
            : null;
        if (nextToken !== lastBridgeToken) {
          lastBridgeToken = nextToken;
          shouldDisconnect = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(changes, 'useBridgeToken')) {
        const nextUse = !!changes.useBridgeToken?.newValue;
        if (nextUse !== lastUseBridgeToken) {
          lastUseBridgeToken = nextUse;
          shouldDisconnect = true;
        }
      }

      if (Object.prototype.hasOwnProperty.call(changes, 'bridgePort')) {
        const sanitized = sanitizePort(changes.bridgePort?.newValue);
        const changed = applyPort(sanitized === null ? DEFAULT_PORT : sanitized);
        if (changed) {
          if (suppressPortDisconnect) {
            suppressPortDisconnect = false;
          } else {
            shouldDisconnect = true;
          }
        }
      }

      broadcastBridgeStatus();

      if (shouldDisconnect) {
        disconnectBridge();
      }
    });
  } catch (error) {
    console.warn('[MCP Bridge] Failed to setup storage listener:', error);
  }
}

async function loadBridgeSettings() {
  try {
    const data = await chrome.storage.sync.get(['bridgePort', 'bridgeToken', 'useBridgeToken']);

    if (Object.prototype.hasOwnProperty.call(data, 'bridgePort')) {
      const sanitized = sanitizePort(data.bridgePort);
      applyPort(sanitized === null ? DEFAULT_PORT : sanitized);
    } else {
      applyPort(DEFAULT_PORT);
    }

    lastBridgeToken = typeof data.bridgeToken === 'string' && data.bridgeToken ? data.bridgeToken : null;
    lastUseBridgeToken = !!data.useBridgeToken;
  } catch (error) {
    console.warn('[MCP Bridge] Failed to load bridge settings:', error);
    applyPort(DEFAULT_PORT);
  } finally {
    broadcastBridgeStatus();
  }
}

export function initializeMcpBridge(context = {}) {
  currentContext = context;

  loadBridgeSettings().catch((error) => {
    console.warn('[MCP Bridge] Failed to initialize bridge settings:', error);
  });

  setupStorageListeners();
}
