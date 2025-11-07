// fetch-utils.js
// Utility functions for async operations, delays, retries, and timeouts

/**
 * Creates a promise that resolves after a specified delay
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(res => setTimeout(res, ms));
}

/**
 * Waits for a tab to reach 'complete' status
 * @param {number} tabId - Chrome tab ID
 * @param {number} timeoutMs - Maximum time to wait in milliseconds
 * @returns {Promise<boolean>} True if tab completed or timeout reached
 */
export async function waitForTabComplete(tabId, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t?.status === 'complete') return true;
    } catch (_) {
      // Ignore transient errors (tab might be loading)
    }
    await delay(200);
  }
  return true; // best-effort
}

/**
 * Sends a message to a tab with retry logic
 * @param {number} tabId - Chrome tab ID
 * @param {object} msg - Message to send
 * @param {number} retries - Number of retry attempts
 * @param {number} backoffMs - Delay between retries in milliseconds
 * @returns {Promise<any>} Response from content script
 * @throws {Error} If all retries fail
 */
export async function sendMessageWithRetry(tabId, msg, retries = 2, backoffMs = 400) {
  let lastErr = null;
  for (let i = 0; i <= retries; i++) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, msg);
      return resp;
    } catch (e) {
      lastErr = e;
      await delay(backoffMs);
    }
  }
  throw lastErr || new Error('sendMessage failed');
}

/**
 * Captures a screenshot with timeout
 * @param {number} windowId - Chrome window ID
 * @param {object} options - Chrome capture options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<string>} Data URL of screenshot
 * @throws {Error} If capture times out or fails
 */
export async function captureWithTimeout(windowId, options, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Screenshot timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    chrome.tabs.captureVisibleTab(windowId, options, (dataUrl) => {
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(dataUrl);
      }
    });
  });
}

/**
 * Wraps a fetch call with timeout
 * @param {string} url - URL to fetch
 * @param {object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Response>} Fetch response
 * @throws {Error} If fetch times out
 */
export async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Generates a random delay for humanizing interactions
 * @param {number} minMs - Minimum delay in milliseconds
 * @param {number} maxMs - Maximum delay in milliseconds
 * @returns {number} Random delay in milliseconds
 */
export function randomDelay(minMs, maxMs) {
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

/**
 * Executes a function with retry logic
 * @param {Function} fn - Async function to execute
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delayMs - Delay between retries
 * @returns {Promise<any>} Result of function execution
 * @throws {Error} If all retries fail
 */
export async function retryOperation(fn, maxRetries = 3, delayMs = 1000) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        await delay(delayMs * (attempt + 1)); // Exponential backoff
      }
    }
  }
  throw lastError;
}
