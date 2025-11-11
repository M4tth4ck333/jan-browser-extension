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

  // Debug: Log what we're looking for and what's available
  const allKeys = Array.from(map.keys());
  console.log(`[RefMap] Looking for refId: "${refId}" (type: ${typeof refId})`);
  console.log(`[RefMap] Map has ${allKeys.length} keys, first 10:`, allKeys.slice(0, 10));
  console.log(`[RefMap] Does map have exact key? ${map.has(refId)}`);

  const selector = map.get(refId);
  if (selector) {
    console.log(`[RefMap] ✓ Resolved ${refId} → ${selector}`);
  } else {
    console.log(`[RefMap] ✗ Reference ${refId} not found in map for tab ${tabId}`);
  }

  return selector || null;
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
