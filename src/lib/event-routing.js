// event-routing.js
// Port management and message routing for side panel streaming

import { GLOBAL_KEY } from '../constants.js';

/**
 * Storage for side panel ports by tabId
 * Key can be a tabId number or GLOBAL_KEY
 */
export const sidepanelPorts = new Map();

/**
 * Storage for streaming abort controllers by reqId
 */
export const streamingControllers = new Map();

/**
 * Posts a message to side panel port(s) using routing strategy:
 * 1. Prefer tab-specific port if available
 * 2. Fall back to global port if no tab-specific port
 * 3. Broadcast to all ports if neither available
 *
 * @param {object} msg - Message to post
 * @param {number|null} tabId - Tab ID for routing (optional)
 * @param {string|null} reqId - Request ID to include in message (optional)
 */
export function postToSidePanel(msg, tabId = null, reqId = null) {
  // [JAN-BEHAVIOR:STREAM-EMIT] route stream events to side panel port(s)
  const specific = tabId ? sidepanelPorts.get(tabId) : null;
  const global = sidepanelPorts.get(GLOBAL_KEY);
  const targets = specific ? [specific] : (global ? [global] : Array.from(new Set(sidepanelPorts.values())));

  const messageToSend = reqId ? { reqId, ...msg } : msg;

  for (const p of targets) {
    try {
      p.postMessage(messageToSend);
    } catch (err) {
      // Port might be disconnected, silently ignore
      console.warn('[Event Routing] Failed to post message:', err);
    }
  }
}

/**
 * Gets a specific port by tabId or global key
 * @param {number|string} key - Tab ID or GLOBAL_KEY
 * @returns {chrome.runtime.Port|null} Port or null if not found
 */
export function getPort(key) {
  return sidepanelPorts.get(key) || null;
}

/**
 * Registers a port for a specific tab
 * @param {number|string} key - Tab ID or GLOBAL_KEY
 * @param {chrome.runtime.Port} port - Port to register
 */
export function registerPort(key, port) {
  sidepanelPorts.set(key, port);
  try {
    console.log('[Event Routing] Port registered', { key });
  } catch (_) {}
}

/**
 * Unregisters a port
 * @param {number|string} key - Tab ID or GLOBAL_KEY
 */
export function unregisterPort(key) {
  sidepanelPorts.delete(key);
  try {
    console.log('[Event Routing] Port unregistered', { key });
  } catch (_) {}
}

/**
 * Unregisters all ports matching a specific port instance
 * @param {chrome.runtime.Port} port - Port instance to remove
 */
export function unregisterPortInstance(port) {
  for (const [key, p] of sidepanelPorts.entries()) {
    if (p === port) {
      sidepanelPorts.delete(key);
    }
  }
}

/**
 * Registers an abort controller for a streaming request
 * @param {string} reqId - Request ID
 * @param {AbortController} controller - Abort controller
 */
export function registerStreamController(reqId, controller) {
  streamingControllers.set(reqId, controller);
}

/**
 * Aborts and removes a streaming request
 * @param {string} reqId - Request ID
 * @returns {boolean} True if controller was found and aborted
 */
export function abortStream(reqId) {
  const controller = streamingControllers.get(reqId);
  if (controller) {
    try {
      controller.abort();
      streamingControllers.delete(reqId);
      return true;
    } catch (err) {
      console.warn('[Event Routing] Failed to abort stream:', err);
      streamingControllers.delete(reqId);
      return false;
    }
  }
  return false;
}

/**
 * Checks if a streaming request is active
 * @param {string} reqId - Request ID
 * @returns {boolean} True if request has an active controller
 */
export function isStreamActive(reqId) {
  return streamingControllers.has(reqId);
}

/**
 * Cleans up a streaming request (removes controller without aborting)
 * @param {string} reqId - Request ID
 */
export function cleanupStream(reqId) {
  streamingControllers.delete(reqId);
}

/**
 * Gets the count of active ports
 * @returns {number} Number of registered ports
 */
export function getPortCount() {
  return sidepanelPorts.size;
}

/**
 * Gets the count of active streams
 * @returns {number} Number of active streaming controllers
 */
export function getStreamCount() {
  return streamingControllers.size;
}
