/**
 * Element Reference Mapping
 *
 * Stores mappings from accessibility tree refs (like "s1e14") to DOM element selectors.
 * Each snapshot's refs are stored separately to allow refs from previous snapshots to remain valid.
 * This allows click/automation tools to resolve Chrome accessibility IDs to actual elements.
 */

// Structure: { tabId: { snapshotId: Map<refId, entry> } }
const refMapsBySnapshot = new Map();

// Maximum age of a snapshot's reference map before it's considered stale (5 minutes)
const MAX_MAP_AGE_MS = 5 * 60 * 1000;

// Metadata for each snapshot: { tabId: { snapshotId: { timestamp, url } } }
const snapshotMetadata = new Map();

/**
 * Extract snapshot ID from a ref (e.g., "s1e14" -> "s1", "s2f1e3" -> "s2")
 */
function extractSnapshotId(refId) {
  if (!refId || typeof refId !== 'string') return null;
  const match = refId.match(/^(s\d+)/);
  return match ? match[1] : null;
}

/**
 * Store element reference mapping for a tab's snapshot
 * @param {number} tabId - Tab ID
 * @param {Object} refMap - Map of ref IDs to CSS selectors { refId: cssSelector }
 * @param {Object} metadata - Optional metadata { url, timestamp, snapshotId }
 */
export function setElementRefMap(tabId, refMap, metadata = {}) {
  if (typeof tabId !== 'number') {
    console.warn('[RefMap] Invalid tabId:', tabId);
    return;
  }

  // Determine snapshot ID from the first ref or metadata
  const refEntries = Object.entries(refMap || {});
  const firstRef = refEntries.length > 0 ? refEntries[0][0] : null;
  const snapshotId = metadata.snapshotId || extractSnapshotId(firstRef) || 'unknown';

  // Initialize tab's snapshot map if needed
  if (!refMapsBySnapshot.has(tabId)) {
    refMapsBySnapshot.set(tabId, new Map());
  }
  if (!snapshotMetadata.has(tabId)) {
    snapshotMetadata.set(tabId, new Map());
  }

  const tabSnapshots = refMapsBySnapshot.get(tabId);
  const tabMetadata = snapshotMetadata.get(tabId);

  // Create normalized map for this snapshot
  const normalized = new Map();
  refEntries.forEach(([refId, value]) => {
    if (!refId) return;
    if (value && typeof value === 'object') {
      const entry = {};
      if (value.css) entry.css = value.css;
      if (typeof value.backend === 'number') entry.backend = value.backend;
      if (value.frameId) entry.frameId = value.frameId;
      if (typeof value.parentRef === 'string') entry.parentRef = value.parentRef;
      if (typeof value.childIndex === 'number') entry.childIndex = value.childIndex;
      if (value.placeholder === true) entry.placeholder = true;
      if (
        entry.css ||
        entry.backend !== undefined ||
        entry.parentRef ||
        entry.childIndex !== undefined ||
        entry.placeholder ||
        entry.frameId
      ) {
        normalized.set(refId, entry);
      }
    } else if (typeof value === 'string') {
      if (value.startsWith('backend:')) {
        const id = Number(value.slice(8));
        if (!Number.isNaN(id)) {
          normalized.set(refId, { backend: id });
        }
      } else {
        normalized.set(refId, { css: value });
      }
    }
  });

  // Store this snapshot's refs separately
  tabSnapshots.set(snapshotId, normalized);
  tabMetadata.set(snapshotId, {
    timestamp: Date.now(),
    url: metadata.url || 'unknown',
    ...metadata,
  });

  const snapshotCount = tabSnapshots.size;
  console.log(`[RefMap] Stored ${normalized.size} refs for tab ${tabId} snapshot ${snapshotId} (${snapshotCount} snapshots cached)`);
}

/**
 * Get ref entry by looking up in the appropriate snapshot
 * @param {number} tabId - Tab ID
 * @param {string} refId - Reference ID (e.g., "s1e14")
 * @returns {Object|null} Entry object or null if not found
 */
function getRefEntry(tabId, refId) {
  const tabSnapshots = refMapsBySnapshot.get(tabId);
  if (!tabSnapshots || tabSnapshots.size === 0) {
    console.log(`[RefMap] No reference maps found for tab ${tabId}`);
    return null;
  }

  // Extract snapshot ID from the ref
  const snapshotId = extractSnapshotId(refId);
  if (!snapshotId) {
    console.warn(`[RefMap] Could not extract snapshot ID from ref: ${refId}`);
    return null;
  }

  // Look up in the specific snapshot's map
  const snapshotMap = tabSnapshots.get(snapshotId);
  if (!snapshotMap) {
    console.warn(`[RefMap] Snapshot ${snapshotId} not found for tab ${tabId}`);
    console.warn(`[RefMap] Available snapshots:`, Array.from(tabSnapshots.keys()));
    return null;
  }

  // Check staleness
  const tabMeta = snapshotMetadata.get(tabId);
  const meta = tabMeta?.get(snapshotId);
  if (meta) {
    const age = Date.now() - meta.timestamp;
    if (age > MAX_MAP_AGE_MS) {
      console.warn(`[RefMap] Snapshot ${snapshotId} for tab ${tabId} is stale (${Math.round(age / 1000)}s old)`);
    }
  }

  const entry = snapshotMap.get(refId);
  if (!entry) {
    console.warn(`[RefMap] Reference ${refId} not found in snapshot ${snapshotId} for tab ${tabId}`);
    console.warn(`[RefMap] Available refs (first 20):`, Array.from(snapshotMap.keys()).slice(0, 20));
  } else {
    console.log(`[RefMap] Resolved ${refId} →`, entry);
  }

  return entry || null;
}

export function getElementSelector(tabId, refId) {
  const entry = getRefEntry(tabId, refId);
  return entry?.css || null;
}

export function getBackendNodeId(tabId, refId) {
  const entry = getRefEntry(tabId, refId);
  return typeof entry?.backend === 'number' ? entry.backend : null;
}

export function getRefMetadata(tabId, refId) {
  const entry = getRefEntry(tabId, refId);
  if (!entry) return { parentRef: null, childIndex: null };
  return {
    parentRef: entry.parentRef || null,
    childIndex: typeof entry.childIndex === 'number' ? entry.childIndex : null,
  };
}

/**
 * Get frameId for a reference ID in a specific tab
 * @param {number} tabId - Tab ID
 * @param {string} refId - Reference ID (e.g., "s1f1e5")
 * @returns {string|null} Frame ID or null if main frame or not found
 */
export function getFrameId(tabId, refId) {
  const entry = getRefEntry(tabId, refId);
  return entry?.frameId || null;
}

/**
 * Check if a reference exists in any snapshot for a tab
 * @param {number} tabId - Tab ID
 * @param {string} refId - Reference ID
 * @returns {boolean} True if ref exists
 */
export function hasRef(tabId, refId) {
  const entry = getRefEntry(tabId, refId);
  return entry !== null;
}

/**
 * Check if any reference map exists for a tab
 * @param {number} tabId - Tab ID
 * @returns {boolean}
 */
export function hasElementRefMap(tabId) {
  const tabSnapshots = refMapsBySnapshot.get(tabId);
  return tabSnapshots && tabSnapshots.size > 0;
}

/**
 * Get a shallow copy of all reference maps for a tab (merged)
 * @param {number} tabId - Tab ID
 * @returns {Map<string, Object>|null}
 */
export function getElementRefMap(tabId) {
  const tabSnapshots = refMapsBySnapshot.get(tabId);
  if (!tabSnapshots || tabSnapshots.size === 0) return null;

  // Merge all snapshots into one map for backward compatibility
  const merged = new Map();
  for (const snapshotMap of tabSnapshots.values()) {
    for (const [refId, entry] of snapshotMap) {
      merged.set(refId, entry);
    }
  }
  return merged;
}

/**
 * Clear all reference maps for a specific tab
 * @param {number} tabId - Tab ID
 */
export function clearElementRefMap(tabId) {
  const hadSnapshots = refMapsBySnapshot.delete(tabId);
  const hadMetadata = snapshotMetadata.delete(tabId);
  if (hadSnapshots || hadMetadata) {
    console.log(`[RefMap] Cleared all reference maps for tab ${tabId}`);
  }
}

/**
 * Clear a specific snapshot's reference map
 * @param {number} tabId - Tab ID
 * @param {string} snapshotId - Snapshot ID (e.g., "s1")
 */
export function clearSnapshotRefMap(tabId, snapshotId) {
  const tabSnapshots = refMapsBySnapshot.get(tabId);
  const tabMeta = snapshotMetadata.get(tabId);
  if (tabSnapshots) tabSnapshots.delete(snapshotId);
  if (tabMeta) tabMeta.delete(snapshotId);
  console.log(`[RefMap] Cleared snapshot ${snapshotId} for tab ${tabId}`);
}

/**
 * Clear all reference maps
 */
export function clearAllElementRefMaps() {
  const tabCount = refMapsBySnapshot.size;
  refMapsBySnapshot.clear();
  snapshotMetadata.clear();
  console.log(`[RefMap] Cleared all reference maps for ${tabCount} tabs`);
}

/**
 * Get reference map metadata for debugging
 * @param {number} tabId - Tab ID
 * @param {string} snapshotId - Optional snapshot ID
 * @returns {Object|null} Metadata object or null
 */
export function getRefMapMetadata(tabId, snapshotId = null) {
  const tabMeta = snapshotMetadata.get(tabId);
  if (!tabMeta) return null;

  if (snapshotId) {
    return tabMeta.get(snapshotId) || null;
  }

  // Return metadata for most recent snapshot
  let latest = null;
  let latestTime = 0;
  for (const meta of tabMeta.values()) {
    if (meta.timestamp > latestTime) {
      latestTime = meta.timestamp;
      latest = meta;
    }
  }
  return latest;
}

/**
 * Get all stored tab IDs with reference maps
 * @returns {number[]} Array of tab IDs
 */
export function getStoredTabIds() {
  return Array.from(refMapsBySnapshot.keys());
}

/**
 * Get all snapshot IDs for a tab
 * @param {number} tabId - Tab ID
 * @returns {string[]} Array of snapshot IDs
 */
export function getSnapshotIds(tabId) {
  const tabSnapshots = refMapsBySnapshot.get(tabId);
  return tabSnapshots ? Array.from(tabSnapshots.keys()) : [];
}

/**
 * Clean up stale reference maps
 */
export function cleanupStaleRefMaps() {
  const now = Date.now();
  let cleaned = 0;

  for (const [tabId, tabMeta] of snapshotMetadata.entries()) {
    const tabSnapshots = refMapsBySnapshot.get(tabId);
    if (!tabSnapshots) continue;

    for (const [snapshotId, meta] of tabMeta.entries()) {
      const age = now - meta.timestamp;
      if (age > MAX_MAP_AGE_MS) {
        tabSnapshots.delete(snapshotId);
        tabMeta.delete(snapshotId);
        cleaned++;
      }
    }

    // Clean up empty tab entries
    if (tabSnapshots.size === 0) {
      refMapsBySnapshot.delete(tabId);
      snapshotMetadata.delete(tabId);
    }
  }

  if (cleaned > 0) {
    console.log(`[RefMap] Cleaned up ${cleaned} stale snapshot reference maps`);
  }

  return cleaned;
}

// Auto-cleanup every 5 minutes
setInterval(cleanupStaleRefMaps, 5 * 60 * 1000);
