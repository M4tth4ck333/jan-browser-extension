/**
 * Element Reference Mapping
 *
 * Stores mappings from accessibility tree refs (like "s1e14") to DOM element selectors.
 * This allows click/automation tools to resolve Chrome accessibility IDs to actual elements.
 */

// Global reference map: { tabId: { refId: cssSelector } }
const refMaps = new Map();

// Maximum age of a reference map before it's considered stale (5 minutes)
const MAX_MAP_AGE_MS = 5 * 60 * 1000;

// Metadata for each map: { timestamp, url }
const refMapMetadata = new Map();

/**
 * Store element reference mapping for a tab
 * @param {number} tabId - Tab ID
 * @param {Object} refMap - Map of ref IDs to CSS selectors { refId: cssSelector }
 * @param {Object} metadata - Optional metadata { url, timestamp }
 */
export function setElementRefMap(tabId, refMap, metadata = {}) {
  if (typeof tabId !== 'number') {
    console.warn('[RefMap] Invalid tabId:', tabId);
    return;
  }

  refMaps.set(tabId, new Map(Object.entries(refMap)));
  refMapMetadata.set(tabId, {
    timestamp: Date.now(),
    url: metadata.url || 'unknown',
    ...metadata,
  });

  console.log(`[RefMap] Stored ${Object.keys(refMap).length} references for tab ${tabId}`);
}

/**
 * Get CSS selector for a reference ID in a specific tab
 * @param {number} tabId - Tab ID
 * @param {string} refId - Reference ID (e.g., "s1e14")
 * @returns {string|null} CSS selector or null if not found
 */
export function getElementSelector(tabId, refId) {
  const map = refMaps.get(tabId);
  if (!map) {
    console.log(`[RefMap] No reference map found for tab ${tabId}`);
    return null;
  }

  const metadata = refMapMetadata.get(tabId);
  if (metadata) {
    const age = Date.now() - metadata.timestamp;
    if (age > MAX_MAP_AGE_MS) {
      console.warn(`[RefMap] Reference map for tab ${tabId} is stale (${Math.round(age / 1000)}s old)`);
    }
  }

  const selector = map.get(refId);
  if (!selector) {
    console.warn(`[RefMap] Reference ${refId} not found in map for tab ${tabId}`);
  }

  return selector || null;
}

/**
 * Check if a reference map exists for a tab
 * @param {number} tabId - Tab ID
 * @returns {boolean}
 */
export function hasElementRefMap(tabId) {
  return refMaps.has(tabId);
}

/**
 * Get a shallow copy of the reference map for a tab
 * @param {number} tabId - Tab ID
 * @returns {Map<string, string>|null}
 */
export function getElementRefMap(tabId) {
  const map = refMaps.get(tabId);
  if (!map) return null;
  return new Map(map);
}

/**
 * Clear reference map for a specific tab
 * @param {number} tabId - Tab ID
 */
export function clearElementRefMap(tabId) {
  const deleted = refMaps.delete(tabId) && refMapMetadata.delete(tabId);
  if (deleted) {
    console.log(`[RefMap] Cleared reference map for tab ${tabId}`);
  }
}

/**
 * Clear all reference maps
 */
export function clearAllElementRefMaps() {
  const count = refMaps.size;
  refMaps.clear();
  refMapMetadata.clear();
  console.log(`[RefMap] Cleared all ${count} reference maps`);
}

/**
 * Get reference map metadata for debugging
 * @param {number} tabId - Tab ID
 * @returns {Object|null} Metadata object or null
 */
export function getRefMapMetadata(tabId) {
  return refMapMetadata.get(tabId) || null;
}

/**
 * Get all stored tab IDs with reference maps
 * @returns {number[]} Array of tab IDs
 */
export function getStoredTabIds() {
  return Array.from(refMaps.keys());
}

/**
 * Clean up stale reference maps
 */
export function cleanupStaleRefMaps() {
  const now = Date.now();
  let cleaned = 0;

  for (const [tabId, metadata] of refMapMetadata.entries()) {
    const age = now - metadata.timestamp;
    if (age > MAX_MAP_AGE_MS) {
      refMaps.delete(tabId);
      refMapMetadata.delete(tabId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[RefMap] Cleaned up ${cleaned} stale reference maps`);
  }

  return cleaned;
}

// Auto-cleanup every 5 minutes
setInterval(cleanupStaleRefMaps, 5 * 60 * 1000);
