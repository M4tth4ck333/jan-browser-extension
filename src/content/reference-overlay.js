// reference-overlay.js
// Visual overlay system for displaying element references (Vimium-style)

const OVERLAY_CONTAINER_ID = 'jan-mcp-reference-overlay-container';
const OVERLAY_STYLE_ID = 'jan-mcp-reference-overlay-style';
const MARKER_CLASS = 'jan-mcp-ref-marker';

let overlayContainer = null;
let currentMarkers = [];
let isOverlayVisible = false;

/**
 * Inject CSS styles for reference markers (Vimium-inspired design)
 */
function injectStyles() {
  if (document.getElementById(OVERLAY_STYLE_ID)) {
    return; // Already injected
  }

  const style = document.createElement('style');
  style.id = OVERLAY_STYLE_ID;
  style.textContent = `
    #${OVERLAY_CONTAINER_ID} {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2147483647; /* Maximum z-index */
      font-family: system-ui, -apple-system, sans-serif;
    }

    .${MARKER_CLASS} {
      position: absolute;
      pointer-events: none;
      display: inline-block;
      padding: 2px 6px;
      background: linear-gradient(to bottom, #ffd76e 0%, #ffb700 100%);
      border: 1px solid #c38a22;
      border-radius: 3px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.8) inset;
      color: #000;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.2;
      text-transform: lowercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
      transform: translateZ(0);
      user-select: none;
      opacity: 0.95;
      transition: opacity 0.1s ease;
    }

    .${MARKER_CLASS}:hover {
      opacity: 1;
    }

    /* Highlight the target element */
    .${MARKER_CLASS}-highlight {
      outline: 2px solid #ffb700 !important;
      outline-offset: 1px !important;
      background-color: rgba(255, 215, 110, 0.1) !important;
    }
  `;

  document.head.appendChild(style);
}

/**
 * Remove CSS styles
 */
function removeStyles() {
  const style = document.getElementById(OVERLAY_STYLE_ID);
  if (style) {
    style.remove();
  }
}

/**
 * Create overlay container
 */
function createOverlayContainer() {
  if (overlayContainer) {
    return overlayContainer;
  }

  overlayContainer = document.createElement('div');
  overlayContainer.id = OVERLAY_CONTAINER_ID;
  document.documentElement.appendChild(overlayContainer);

  return overlayContainer;
}

/**
 * Remove overlay container
 */
function removeOverlayContainer() {
  if (overlayContainer) {
    overlayContainer.remove();
    overlayContainer = null;
  }
}

/**
 * Resolve element from CSS selector (including shadow DOM support)
 */
function resolveElement(ref) {
  if (typeof ref !== 'string' || ref.length === 0) {
    return null;
  }

  // backend: references can't be resolved in content script
  if (ref.startsWith('backend:')) {
    return null;
  }

  // Handle shadow DOM references (format: css:selector##shadow-selector##nested-shadow-selector)
  if (ref.includes('##')) {
    const parts = ref.split('##');
    let current = null;

    if (parts[0].startsWith('css:')) {
      const hostSelector = parts[0].slice(4);
      try {
        current = document.querySelector(hostSelector);
      } catch (err) {
        return null;
      }
    }

    if (!current) return null;

    for (let i = 1; i < parts.length; i++) {
      if (!current.shadowRoot) return null;
      try {
        current = current.shadowRoot.querySelector(parts[i]);
      } catch (err) {
        return null;
      }
      if (!current) return null;
    }

    return current;
  }

  // Handle regular CSS selector
  if (ref.startsWith('css:')) {
    const selectorText = ref.slice(4);
    if (!selectorText) return null;
    try {
      return document.querySelector(selectorText);
    } catch (err) {
      return null;
    }
  }

  // Fallback: try as direct selector
  try {
    return document.querySelector(ref);
  } catch (err) {
    return null;
  }
}

/**
 * Get optimal position for marker relative to element
 */
function getMarkerPosition(element) {
  const rect = element.getBoundingClientRect();

  // Position marker at top-left of element
  // Offset slightly upward and to the left for better visibility
  return {
    top: Math.max(0, rect.top - 2),
    left: Math.max(0, rect.left - 2),
    visible: rect.width > 0 && rect.height > 0 &&
             rect.top < window.innerHeight &&
             rect.bottom > 0 &&
             rect.left < window.innerWidth &&
             rect.right > 0,
  };
}

/**
 * Create a marker element for a reference
 */
function createMarker(refId, element) {
  const marker = document.createElement('div');
  marker.className = MARKER_CLASS;
  marker.setAttribute('data-ref-id', refId);
  marker.textContent = refId;

  const position = getMarkerPosition(element);

  if (!position.visible) {
    marker.style.display = 'none';
  }

  marker.style.top = `${position.top}px`;
  marker.style.left = `${position.left}px`;

  return marker;
}

/**
 * Show reference overlays for a mapping of refId -> selector
 */
function showReferenceOverlay(refMap) {
  if (!refMap || typeof refMap !== 'object') {
    console.warn('[ReferenceOverlay] Invalid refMap provided');
    return { success: false, error: 'Invalid refMap' };
  }

  // Clear any existing overlays
  hideReferenceOverlay();

  // Inject styles and create container
  injectStyles();
  const container = createOverlayContainer();

  const markers = [];
  const failedRefs = [];
  let visibleCount = 0;
  let totalCount = 0;

  // Create markers for each reference
  let cssRefCount = 0;
  let backendRefCount = 0;

  for (const [refId, selector] of Object.entries(refMap)) {
    totalCount++;

    // Track ref types
    if (selector && selector.startsWith('backend:')) {
      backendRefCount++;
    } else if (selector && selector.startsWith('css:')) {
      cssRefCount++;
    }

    const element = resolveElement(selector);
    if (!element) {
      failedRefs.push({ refId, selector });
      continue;
    }

    const marker = createMarker(refId, element);
    container.appendChild(marker);
    markers.push({ refId, element, marker });

    if (marker.style.display !== 'none') {
      visibleCount++;
    }
  }

  currentMarkers = markers;
  isOverlayVisible = true;

  console.log(`[ReferenceOverlay] Displayed ${visibleCount} visible markers out of ${totalCount} total refs (${cssRefCount} CSS, ${backendRefCount} backend, ${failedRefs.length} failed)`);

  return {
    success: true,
    totalRefs: totalCount,
    visibleMarkers: visibleCount,
    failedRefs: failedRefs.length > 0 ? failedRefs : undefined,
  };
}

/**
 * Hide all reference overlays
 */
function hideReferenceOverlay() {
  // Remove all markers
  currentMarkers.forEach(({ marker }) => {
    if (marker && marker.parentNode) {
      marker.remove();
    }
  });

  currentMarkers = [];
  removeOverlayContainer();
  isOverlayVisible = false;

  console.log('[ReferenceOverlay] Overlays hidden');

  return { success: true };
}

/**
 * Toggle reference overlay visibility
 */
function toggleReferenceOverlay() {
  if (isOverlayVisible) {
    return hideReferenceOverlay();
  } else {
    return { success: false, error: 'No overlay to toggle - use showReferenceOverlay first' };
  }
}

/**
 * Update marker positions (useful after scroll or resize)
 */
function updateMarkerPositions() {
  if (!isOverlayVisible || currentMarkers.length === 0) {
    return { success: false, error: 'No overlay visible' };
  }

  let updated = 0;
  currentMarkers.forEach(({ element, marker }) => {
    const position = getMarkerPosition(element);

    if (position.visible) {
      marker.style.top = `${position.top}px`;
      marker.style.left = `${position.left}px`;
      marker.style.display = '';
      updated++;
    } else {
      marker.style.display = 'none';
    }
  });

  return { success: true, updatedCount: updated };
}

/**
 * Get current overlay status
 */
function getOverlayStatus() {
  return {
    visible: isOverlayVisible,
    markerCount: currentMarkers.length,
    visibleMarkerCount: currentMarkers.filter(({ marker }) => marker.style.display !== 'none').length,
  };
}

// Auto-update marker positions on scroll and resize
if (typeof window !== 'undefined') {
  let scrollTimeout = null;
  window.addEventListener('scroll', () => {
    if (scrollTimeout) clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
      if (isOverlayVisible) {
        updateMarkerPositions();
      }
    }, 100);
  }, { passive: true });

  let resizeTimeout = null;
  window.addEventListener('resize', () => {
    if (resizeTimeout) clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (isOverlayVisible) {
        updateMarkerPositions();
      }
    }, 100);
  }, { passive: true });
}
