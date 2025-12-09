import type { DetectionResult, PongMessage } from '../types/index.js';

// Chromium-based browsers to detect
const CHROMIUM_BROWSERS = ['Chrome', 'Chromium', 'Edge', 'Brave', 'Opera', 'Vivaldi'];

/**
 * Check if the current browser is Chrome/Chromium-based
 */
export function isChromeBrowser(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }

  const userAgent = navigator.userAgent;

  // Check for Chromium-based browsers
  for (const browser of CHROMIUM_BROWSERS) {
    if (userAgent.includes(browser)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if chrome.runtime API is available
 */
export function hasChromeRuntime(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    chrome !== null &&
    typeof chrome.runtime !== 'undefined' &&
    chrome.runtime !== null &&
    typeof chrome.runtime.sendMessage === 'function'
  );
}

/**
 * Ping the extension to check if it's installed and responding
 * @param extensionId - The Chrome extension ID
 * @param timeoutMs - Timeout in milliseconds (default: 3000)
 * @returns Promise resolving to true if extension responds, false otherwise
 */
export async function isExtensionAvailable(
  extensionId: string,
  timeoutMs: number = 3000
): Promise<boolean> {
  if (!hasChromeRuntime()) {
    return false;
  }

  try {
    const result = await detectExtension(extensionId, timeoutMs);
    return result.isExtensionAvailable;
  } catch {
    return false;
  }
}

/**
 * Full detection of browser compatibility and extension availability
 * @param extensionId - The Chrome extension ID
 * @param timeoutMs - Timeout in milliseconds (default: 3000)
 * @returns Promise resolving to DetectionResult
 */
export async function detectExtension(
  extensionId: string,
  timeoutMs: number = 3000
): Promise<DetectionResult> {
  const result: DetectionResult = {
    isChrome: isChromeBrowser(),
    hasChromeRuntime: hasChromeRuntime(),
    isExtensionAvailable: false,
  };

  // If not Chrome or no runtime, return early
  if (!result.isChrome) {
    result.error = 'Browser is not Chrome/Chromium-based';
    return result;
  }

  if (!result.hasChromeRuntime) {
    result.error = 'chrome.runtime API is not available';
    return result;
  }

  // Try to ping the extension
  try {
    const response = await pingExtension(extensionId, timeoutMs);
    if (response) {
      result.isExtensionAvailable = true;
      result.extensionVersion = response.version;
    } else {
      result.error = 'Extension did not respond';
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Failed to ping extension';
  }

  return result;
}

/**
 * Send a ping message to the extension and wait for pong response
 */
async function pingExtension(
  extensionId: string,
  timeoutMs: number
): Promise<PongMessage | null> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      resolve(null);
    }, timeoutMs);

    try {
      chrome.runtime.sendMessage(
        extensionId,
        { kind: 'ping' },
        (response: unknown) => {
          clearTimeout(timeoutId);

          // Check for chrome.runtime.lastError (extension not installed)
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }

          // Validate response
          if (
            response &&
            typeof response === 'object' &&
            'kind' in response &&
            (response as { kind: string }).kind === 'pong'
          ) {
            resolve(response as PongMessage);
          } else {
            resolve(null);
          }
        }
      );
    } catch {
      clearTimeout(timeoutId);
      resolve(null);
    }
  });
}
