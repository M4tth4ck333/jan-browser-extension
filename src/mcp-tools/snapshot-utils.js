// snapshot-utils.js
// Shared helpers for building ARIA snapshot responses that match the MCP server

import { selectTab } from '../lib/tab-manager.js';
import { clearElementRefMap, getElementRefMap, setElementRefMap } from '../lib/element-ref-map.js';

const DEBUGGER_PROTOCOL_VERSION = '1.3';
const MAX_TREE_DEPTH = 8;
const MAX_CHILDREN_PER_NODE = 16;
const MAX_INTERACTIVE_ELEMENTS = 60;
const MAX_LANDMARKS = 20;

const INTERACTIVE_ROLE_KEYS = new Set(
  [
    'button',
    'link',
    'textbox',
    'textfield',
    'searchbox',
    'combobox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'menu',
    'menubar',
    'listitem',
    'listboxoption',
    'option',
    'treeitem',
    'gridcell',
    'row',
    'cell',
    'switch',
    'checkbox',
    'radiobutton',
    'slider',
    'tab',
    'tabpanel',
    'togglebutton',
    'buttonmenu',
    'text',
  ].map((role) => role.toLowerCase()),
);

const LANDMARK_ROLE_KEYS = new Set(
  [
    'banner',
    'navigation',
    'main',
    'contentinfo',
    'complementary',
    'search',
    'region',
    'form',
    'aside',
    'footer',
    'header',
  ].map((role) => role.toLowerCase()),
);

let currentAxRefMap = new Map();
let currentAxRefCounter = 2;
let currentSnapshotPrefix = 's1';
const snapshotCache = new Map();
const snapshotIdsByTab = new Map();
const snapshotSequenceByTab = new Map();
let navigationListenersRegistered = false;

function ensureNavigationCacheResets() {
  if (navigationListenersRegistered) return;
  if (!chrome?.tabs?.onUpdated) return;

  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo?.status === 'loading') {
      clearSnapshotsForTab(tabId);
    }
  });

  chrome.tabs.onRemoved?.addListener((tabId) => {
    clearSnapshotsForTab(tabId);
  });

  navigationListenersRegistered = true;
}

ensureNavigationCacheResets();

function resetAccessibleRefMap() {
  currentAxRefMap = new Map();
  currentAxRefCounter = 2;
}

export function clearSnapshotsForTab(tabId) {
  if (typeof tabId !== 'number') return;

  const cachedIds = snapshotIdsByTab.get(tabId);
  if (cachedIds && cachedIds.size) {
    for (const id of cachedIds) {
      snapshotCache.delete(id);
    }
  }

  snapshotIdsByTab.delete(tabId);
  snapshotSequenceByTab.delete(tabId);
  currentSnapshotPrefix = 's1';
  resetAccessibleRefMap();
  clearElementRefMap(tabId);
  console.log(`[snapshot] Cleared cached snapshots and ref map for tab ${tabId}`);
}

function createErrorResult(message, error) {
  const text = `${message}: ${String(error?.message || error)}`;
  return {
    ok: false,
    error: text,
    content: [
      {
        type: 'text',
        text,
      },
    ],
    isError: true,
  };
}

function formatSnapshotAsYAML(data) {
  if (!data) {
    return 'error: No snapshot data available';
  }

  const tree = data.aria?.tree;
  if (tree) {
    return renderTree(tree).join('\n');
  }

  const lines = [];
  lines.push(`url: ${data.url || 'unknown'}`);
  lines.push(`title: ${data.title || 'Untitled'}`);
  if (data.description) lines.push(`description: ${data.description}`);
  return lines.join('\n');
}

function renderTree(node, depth = 0) {
  if (!node) return [];

  const lines = [];
  const indent = '  '.repeat(depth);
  const parts = [];
  const rawRole = (node?.role || node?.tag || 'node').toString();
  const role = rawRole.toLowerCase();
  parts.push(role);

  if (node?.name && role !== 'document') {
    parts.push(`"${String(node.name)}"`);
  }

  const state = node?.state || {};
  const stateFlags = [];
  if (state.expanded || node?.expanded) stateFlags.push('[expanded]');
  if (state.selected || node?.selected) stateFlags.push('[selected]');
  if (state.checked || node?.checked) stateFlags.push('[checked]');
  if (state.focused || node?.focused) stateFlags.push('[focused]');
  if (state.disabled || node?.disabled) stateFlags.push('[disabled]');

  // Add Shadow DOM indicator
  if (node?.inShadowDOM) {
    stateFlags.push('[shadow-dom]');
    if (node?.shadowHost) {
      stateFlags.push(`[host=${node.shadowHost}]`);
    }
  }

  const properties = node?.properties || {};
  const headerMeta = [];
  const level =
    node?.level ?? properties.level ?? properties.headingLevel ?? properties.hierarchicalLevel;
  if (level !== undefined && level !== null && String(level).trim() !== '') {
    headerMeta.push(`[level=${level}]`);
  }

  const ref = node?.ref || node?.id || node?.backendNodeId || node?.domNodeId;
  const headerParts = [...parts, ...stateFlags, ...headerMeta];
  if (ref) {
    headerParts.push(`[ref=${ref}]`);
  }

  const headerBody = headerParts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const children = Array.isArray(node?.children) ? node.children : [];
  const detailLines = buildDetailLines(node, depth + 1);
  const needsColon = children.length > 0 || detailLines.length > 0;
  const header = `${indent}- ${headerBody}${needsColon ? ':' : ''}`;
  lines.push(header);
  lines.push(...detailLines);

  for (const child of children) {
    lines.push(...renderTree(child, depth + 1));
  }

  return lines;
}

function buildDetailLines(node, depth) {
  const lines = [];
  const indent = '  '.repeat(depth);

  const roleKey = String(node?.role || node?.tag || '').toLowerCase();
  const url = node?.properties?.url || node?.href;
  if (url && (roleKey === 'link' || roleKey === 'a')) {
    lines.push(`${indent}- /url: ${url}`);
  }

  const textValue = node?.value || node?.text || node?.description;
  if (textValue) {
    lines.push(`${indent}- text: ${String(textValue).slice(0, 400)}`);
  }

  return lines;
}

function buildSnapshotText(snapshot, status, details = []) {
  const normalizedDetails = (details || []).filter(Boolean);
  const detailLines = normalizedDetails.map((line) => (line.startsWith('- ') ? line : `- ${line}`));
  const detailBlock = detailLines.length ? `${detailLines.join('\n')}\n` : '';

  const yaml = formatSnapshotAsYAML(snapshot);
  const pageUrl = snapshot?.url || 'unknown';
  const pageTitle = snapshot?.title || 'Untitled';

  const statusLine = status ? `${status}\n` : '';

  return (
    `${statusLine}` +
    `${detailBlock}` +
    `- Page URL: ${pageUrl}\n` +
    `- Page Title: ${pageTitle}\n` +
    `- Page Snapshot\n` +
    '```yaml\n' +
    `${yaml}\n` +
    '```'
  );
}

async function captureDomSnapshot(tabId, fullPage = true) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (fullPage) => {
      const buildElementRef = (element, shadowPath = []) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return null;

        // Check if element is in a shadow DOM
        let currentRoot = element.getRootNode();
        const inShadowDOM = currentRoot !== document;

        if (inShadowDOM && currentRoot.host) {
          // Build path within shadow DOM
          const shadowSegments = [];
          let current = element;

          while (current && current !== currentRoot) {
            const parent = current.parentElement;
            if (!parent) break;

            let selector = current.tagName.toLowerCase();
            const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
            if (siblings.length > 1) {
              const index = siblings.indexOf(current) + 1;
              selector += `:nth-of-type(${index})`;
            }

            shadowSegments.unshift(selector);
            current = parent;
          }

          // Recursively build path to shadow host
          const hostPath = buildElementRef(currentRoot.host, [...shadowPath, shadowSegments.join(' > ')]);
          if (!hostPath) return null;

          // Format: shadow:host-selector##shadow-internal-selector##nested-shadow-selector
          if (shadowPath.length > 0 || shadowSegments.length > 0) {
            const shadowPart = shadowSegments.join(' > ');
            return `${hostPath}##${shadowPart}`;
          }
          return hostPath;
        }

        // Regular DOM element (not in shadow DOM)
        if (element === document.body) return 'css:body';

        const segments = [];
        let current = element;
        while (current && current !== document.body) {
          const parent = current.parentElement;
          if (!parent) break;

          let selector = current.tagName.toLowerCase();
          const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
          if (siblings.length > 1) {
            const index = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${index})`;
          }

          segments.unshift(selector);
          current = parent;
        }

        if (!segments.length) {
          return 'css:body';
        }

        return `css:body > ${segments.join(' > ')}`;
      };

      const isInViewport = (element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.top < window.innerHeight &&
          rect.bottom > 0 &&
          rect.left < window.innerWidth &&
          rect.right > 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      };

      // Helper to check if element should be included based on fullPage flag
      const shouldIncludeElement = (element) => {
        if (fullPage) return true;
        return isInViewport(element);
      };

      const inferRole = (element) => {
        const explicitRole = element.getAttribute('role');
        if (explicitRole) return explicitRole;

        const tag = element.tagName;
        if (tag === 'A') return 'link';
        if (tag === 'BUTTON') return 'button';
        if (tag === 'INPUT') {
          if (element.type === 'checkbox') return 'checkbox';
          if (element.type === 'radio') return 'radio';
          if (element.type === 'submit') return 'button';
          return 'textbox';
        }
        if (tag === 'IMG') return 'img';
        if (tag === 'NAV') return 'navigation';
        if (tag === 'MAIN') return 'main';
        if (tag === 'HEADER') return 'banner';
        if (tag === 'FOOTER') return 'contentinfo';
        if (tag === 'ASIDE') return 'complementary';
        if (tag === 'SECTION') return 'region';
        if (tag.match(/^H[1-6]$/)) return 'heading';
        if (tag === 'FORM') return 'form';
        if (element.hasAttribute('contenteditable')) return 'textbox';
        return null;
      };

      const buildAriaTree = (element, depth = 0, maxDepth = MAX_TREE_DEPTH, inShadow = false) => {
        if (!element || depth > maxDepth) return null;

        const role = inferRole(element);
        if (!role) {
          const children = [];

          // Collect regular children
          for (const child of element.children) {
            const childNode = buildAriaTree(child, depth + 1, maxDepth, inShadow);
            if (childNode) children.push(childNode);
          }

          // Collect Shadow DOM children if element has shadowRoot
          if (element.shadowRoot && element.shadowRoot.children) {
            for (const shadowChild of element.shadowRoot.children) {
              const childNode = buildAriaTree(shadowChild, depth + 1, maxDepth, true);
              if (childNode) {
                childNode.inShadowDOM = true;
                childNode.shadowHost = element.tagName.toLowerCase();
                children.push(childNode);
              }
            }
          }

          if (children.length) {
            return {
              role: 'group',
              name: '',
              tag: element.tagName.toLowerCase(),
              children: children.slice(0, MAX_CHILDREN_PER_NODE),
            };
          }
          return null;
        }

        const textContent = element.textContent?.trim() || '';
        const ariaLabel =
          element.getAttribute('aria-label') ||
          element.getAttribute('aria-labelledby') ||
          element.getAttribute('title') ||
          (role === 'link' || role === 'button' ? textContent.slice(0, 100) : '');

        const node = {
          role,
          name: ariaLabel || textContent.slice(0, 50) || '',
          tag: element.tagName.toLowerCase(),
        };

        const ref = buildElementRef(element);
        if (ref) node.ref = ref;

        // Mark if this element is in Shadow DOM
        if (inShadow) {
          node.inShadowDOM = true;
        }

        const attr = (name) => element.getAttribute(name);

        if (attr('aria-expanded')) node.expanded = attr('aria-expanded') === 'true';
        if (attr('aria-selected')) node.selected = attr('aria-selected') === 'true';
        if (attr('aria-checked')) node.checked = attr('aria-checked') === 'true';
        if (attr('aria-disabled')) node.disabled = attr('aria-disabled') === 'true';
        if (attr('aria-level')) node.level = Number.parseInt(attr('aria-level'), 10);
        if (attr('aria-current')) node.current = attr('aria-current');

        if (element.id) node.id = element.id;
        if (element.className && typeof element.className === 'string') {
          const trimmed = element.className.trim();
          if (trimmed) node.className = trimmed.split(/\s+/).slice(0, 3).join(' ');
        }

        if (element.href) node.href = element.href;

        const children = [];

        // Collect regular children
        for (const child of element.children) {
          const childNode = buildAriaTree(child, depth + 1, maxDepth, inShadow);
          if (childNode) children.push(childNode);
        }

        // Collect Shadow DOM children if element has shadowRoot
        if (element.shadowRoot && element.shadowRoot.children) {
          for (const shadowChild of element.shadowRoot.children) {
            const childNode = buildAriaTree(shadowChild, depth + 1, maxDepth, true);
            if (childNode) {
              childNode.inShadowDOM = true;
              childNode.shadowHost = element.tagName.toLowerCase();
              children.push(childNode);
            }
          }
        }

        if (children.length) node.children = children.slice(0, MAX_CHILDREN_PER_NODE);

        return node;
      };

      const collectInteractiveElements = () => {
        const results = [];
        const selectors = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]';
        const visited = new WeakSet();

        const collectFromRoot = (root, inShadow = false) => {
          const elements = Array.from(root.querySelectorAll(selectors));
          for (const el of elements) {
            if (visited.has(el)) continue;
            visited.add(el);

            if (!shouldIncludeElement(el)) continue;
            if (results.length >= 50) return;

            const role = inferRole(el) || el.getAttribute('role') || el.tagName.toLowerCase();
            const label =
              el.getAttribute('aria-label') ||
              el.getAttribute('placeholder') ||
              el.getAttribute('title') ||
              el.textContent?.trim().slice(0, 80) || '';

            const item = {
              index: results.length,
              role,
              tag: el.tagName.toLowerCase(),
              label,
              id: el.id || undefined,
              name: el.name || undefined,
              type: el.type || undefined,
              href: el.href || undefined,
              disabled: el.disabled || undefined,
              ariaExpanded: el.getAttribute('aria-expanded') || undefined,
              ariaSelected: el.getAttribute('aria-selected') || undefined,
              ref: buildElementRef(el) || undefined,
            };

            if (inShadow) {
              item.inShadowDOM = true;
            }

            results.push(item);
          }
        };

        const traverseShadowRoots = (root) => {
          const allElements = root.querySelectorAll('*');
          for (const el of allElements) {
            if (el.shadowRoot) {
              collectFromRoot(el.shadowRoot, true);
              traverseShadowRoots(el.shadowRoot);
            }
          }
        };

        // Collect from main document
        collectFromRoot(document);

        // Collect from all shadow DOMs
        traverseShadowRoots(document);

        return results;
      };

      const collectLandmarks = () => {
        const results = [];
        const selectors =
          'main, nav, header, footer, aside, [role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], [role="search"]';
        for (const el of Array.from(document.querySelectorAll(selectors))) {
          if (!shouldIncludeElement(el)) continue;
          const role = inferRole(el) || el.getAttribute('role') || el.tagName.toLowerCase();
          results.push({
            role,
            tag: el.tagName.toLowerCase(),
            ariaLabel: el.getAttribute('aria-label') || undefined,
            id: el.id || undefined,
            ref: buildElementRef(el) || undefined,
          });
          if (results.length >= 10) break;
        }
        return results;
      };

      const collectLinks = () =>
        Array.from(document.querySelectorAll('a[href]'))
          .filter(shouldIncludeElement)
          .slice(0, 30)
          .map((a) => ({
            text: a.textContent?.trim().slice(0, 120) || '',
            href: a.href,
            rel: a.rel || undefined,
            ariaLabel: a.getAttribute('aria-label') || undefined,
          }));

      const collectImages = () =>
        Array.from(document.querySelectorAll('img[src]'))
          .filter(shouldIncludeElement)
          .slice(0, 20)
          .map((img) => ({
            src: img.src,
            alt: img.alt || '',
            ariaLabel: img.getAttribute('aria-label') || undefined,
            ref: buildElementRef(img) || undefined,
          }));

      const collectForms = () => {
        const forms = Array.from(document.querySelectorAll('form'))
          .filter(shouldIncludeElement)
          .slice(0, 5);
        return forms.map((form) => ({
          action: form.action || '',
          method: form.method || '',
          ariaLabel: form.getAttribute('aria-label') || undefined,
          ref: buildElementRef(form) || undefined,
          fields: Array.from(form.querySelectorAll('input, select, textarea'))
            .filter(shouldIncludeElement)
            .slice(0, 15)
            .map((field) => ({
              type: field.type || field.tagName.toLowerCase(),
              name: field.name || undefined,
              id: field.id || undefined,
              placeholder: field.placeholder || undefined,
              ariaLabel: field.getAttribute('aria-label') || undefined,
              required: field.required || undefined,
              ref: buildElementRef(field) || undefined,
            })),
        }));
      };

      const collectHeadings = () =>
        Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'))
          .filter(shouldIncludeElement)
          .slice(0, 20)
          .map((heading) => ({
            level: heading.tagName,
            text: heading.textContent?.trim().slice(0, 120) || '',
            ariaLevel: heading.getAttribute('aria-level') || undefined,
          }));

      const description = document.querySelector('meta[name="description"]')?.content || '';
      const canonical = document.querySelector('link[rel="canonical"]')?.href || '';

      const snapshot = {
        url: window.location.href,
        title: document.title || '',
        description,
        canonical,
        aria: {
          tree: buildAriaTree(document.body) || null,
          interactive: collectInteractiveElements(),
          landmarks: collectLandmarks(),
        },
        links: collectLinks(),
        images: collectImages(),
        forms: collectForms(),
        headings: collectHeadings(),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
        },
        timestamp: new Date().toISOString(),
      };

      return snapshot;
    },
    args: [fullPage],
  });

  return result || null;
}

function axValueToPrimitive(value) {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'object') return value;
  if (Object.prototype.hasOwnProperty.call(value, 'value') && value.value !== undefined) {
    return value.value;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'stringValue')) {
    return value.stringValue;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'intValue')) {
    return value.intValue;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'numberValue')) {
    return value.numberValue;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'boolValue')) {
    return value.boolValue;
  }
  return undefined;
}

function getRole(node) {
  const value = axValueToPrimitive(node?.role);
  return typeof value === 'string' ? value : undefined;
}

function getRoleKey(node) {
  const role = getRole(node);
  return role ? role.toLowerCase() : '';
}

function isUnhelpfulLabel(label, role) {
  if (!label || typeof label !== 'string') return true;

  const lowerLabel = label.toLowerCase();

  // Filter out common third-party extension labels
  const extensionPatterns = [
    'grammarly',
    'screen reader interactions',
    'please activate',
    'browser extension',
    'add-on',
  ];

  for (const pattern of extensionPatterns) {
    if (lowerLabel.includes(pattern)) return true;
  }

  // For textboxes, filter out very generic or empty labels
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    if (label.length < 3) return true;
    if (lowerLabel === 'text' || lowerLabel === 'input') return true;
  }

  return false;
}

function getImprovedAccessibleName(node) {
  const role = normalizeAxRole(getRole(node));
  const rawName = axValueToPrimitive(node?.name);
  const name = typeof rawName === 'string' ? rawName : undefined;

  // If we have a good name, use it
  if (name && !isUnhelpfulLabel(name, role)) {
    return name;
  }

  // For textboxes with unhelpful names, try to get better context
  if (role === 'textbox' || role === 'searchbox' || role === 'combobox') {
    // Try description field
    const description = getAccessibleDescription(node);
    if (description && !isUnhelpfulLabel(description, role)) {
      return description;
    }

    // Try properties for placeholder or other hints
    const properties = axEntriesToObject(node?.properties);
    if (properties) {
      // Check for placeholder
      if (properties.placeholder && !isUnhelpfulLabel(properties.placeholder, role)) {
        return properties.placeholder;
      }

      // Check for aria-placeholder
      if (properties['aria-placeholder'] && !isUnhelpfulLabel(properties['aria-placeholder'], role)) {
        return properties['aria-placeholder'];
      }
    }

    // Try value (for inputs with placeholder-like values)
    const value = axValueToPrimitive(node?.value);
    if (value && typeof value === 'string' && !isUnhelpfulLabel(value, role)) {
      return value;
    }

    // If still no good name, return empty string instead of unhelpful label
    if (name && isUnhelpfulLabel(name, role)) {
      return '';
    }
  }

  // Fall back to original name
  return name;
}

function getAccessibleName(node) {
  const value = axValueToPrimitive(node?.name);
  return typeof value === 'string' ? value : undefined;
}

function getAccessibleDescription(node) {
  const value = axValueToPrimitive(node?.description);
  return typeof value === 'string' ? value : undefined;
}

function axEntriesToObject(entries = []) {
  const result = {};
  for (const entry of entries || []) {
    if (!entry || !entry.name) continue;
    const primitive = axValueToPrimitive(entry.value);
    if (primitive === undefined || primitive === null || primitive === '') continue;
    result[entry.name] = primitive;
  }
  return result;
}

function compactObject(source = {}) {
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    result[key] = value;
  }
  return result;
}

function formatAccessibleRef(nodeId) {
  if (nodeId === undefined || nodeId === null) {
    return undefined;
  }

  if (!currentAxRefMap.has(nodeId)) {
    // Always use counter for stable refs across page reloads
    // s1e0, s1e1, s1e2, etc. - s1 = snapshot 1, e{counter} = element counter
    // This ensures the same element gets the same ref after page reload
    const refId = `${currentSnapshotPrefix}e${currentAxRefCounter}`;
    currentAxRefMap.set(nodeId, refId);
    currentAxRefCounter += 1;
  }

  return currentAxRefMap.get(nodeId);
}

function normalizeAxRole(role) {
  if (!role) return undefined;

  const key = role.toLowerCase();
  switch (key) {
    case 'rootwebarea':
    case 'webarea':
      return 'document';
    case 'genericcontainer':
      return 'generic';
    case 'inlinetextbox':
      return 'text';
    default:
      return key;
  }
}

function shouldFlattenAxNode(node) {
  if (!node) return true;
  if (node.ignored) return true;

  const roleKey = getRoleKey(node);
  if (!roleKey) return true;

  if (
    roleKey === 'generic' ||
    roleKey === 'group' ||
    roleKey === 'presentation' ||
    roleKey === 'none' ||
    roleKey === 'text' ||
    roleKey === 'statictext' ||
    roleKey === 'inlinetextbox'
  ) {
    return true;
  }

  return false;
}

function serializeAxNode(node, map, depth = 0) {
  if (!node || depth > MAX_TREE_DEPTH) return [];

  const includeNode = !shouldFlattenAxNode(node);
  const nextDepth = includeNode ? depth + 1 : depth;

  const rawRole = getRole(node);
  const role = normalizeAxRole(rawRole) || rawRole;
  const name = getImprovedAccessibleName(node);
  const description = getAccessibleDescription(node);
  const value = axValueToPrimitive(node?.value);

  let serialized = null;

  if (includeNode) {
    serialized = compactObject({
      id: formatAccessibleRef(node.nodeId),
      ref: formatAccessibleRef(node.nodeId),
      axNodeId: node.nodeId,
      role,
      name,
      description,
      value,
    });

    if (Array.isArray(node.actions) && node.actions.length) {
      serialized.actions = node.actions.slice(0, 6);
    }

    const properties = compactObject(axEntriesToObject(node.properties));
    const state = compactObject(axEntriesToObject(node.state));

    if (Object.keys(properties).length) serialized.properties = properties;
    if (Object.keys(state).length) serialized.state = state;

    if (node.backendDOMNodeId) serialized.backendNodeId = node.backendDOMNodeId;
    if (node.domNodeId) serialized.domNodeId = node.domNodeId;
  }

  const children = [];
  if (Array.isArray(node.childIds) && node.childIds.length) {
    for (const childId of node.childIds) {
      const child = map.get(childId);
      const serializedChildren = serializeAxNode(child, map, nextDepth);
      if (serializedChildren.length) {
        for (const entry of serializedChildren) {
          children.push(entry);
          if (children.length >= MAX_CHILDREN_PER_NODE) break;
        }
      }
      if (children.length >= MAX_CHILDREN_PER_NODE) break;
    }
  }

  if (!includeNode) {
    return children;
  }

  if (children.length) {
    serialized.children = children;
  }

  return [serialized];
}

function extractInteractiveFromAxNodes(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return [];

  const results = [];

  for (const node of nodes) {
    if (!node || node.ignored) continue;

    const role = getRole(node);
    const roleKey = getRoleKey(node);
    const name = getAccessibleName(node);
    const description = getAccessibleDescription(node);
    const value = axValueToPrimitive(node?.value);
    const properties = axEntriesToObject(node.properties);
    const state = axEntriesToObject(node.state);
    const actions = Array.isArray(node.actions) ? node.actions : [];

    const interactiveRole = INTERACTIVE_ROLE_KEYS.has(roleKey);
    const focusable = properties.focusable === true || properties.focusable === 'true' || state.focused === true;
    const actionable = properties.clickable === true || actions.length > 0 || properties.haspopup === true;
    const selected = state.selected === true;
    const checked = state.checked === true;
    const disabled = state.disabled === true || properties.disabled === true;

    if (!interactiveRole && !focusable && !actionable && !selected && !checked) {
      continue;
    }

    const mergedProperties = { ...properties };
    delete mergedProperties.focusable;
    delete mergedProperties.focused;
    delete mergedProperties.selected;
    delete mergedProperties.disabled;
    delete mergedProperties.checked;
    delete mergedProperties.clickable;

    const entry = compactObject({
      role,
      label: name,
      name,
      description,
      value,
      focused: state.focused === true ? true : undefined,
      selected: selected ? true : undefined,
      checked: checked ? true : undefined,
      disabled: disabled ? true : undefined,
      actions: actions.length ? actions.slice(0, 6) : undefined,
      backendNodeId: node.backendDOMNodeId || undefined,
      domNodeId: node.domNodeId || undefined,
      ref: node.nodeId || undefined,
      properties: compactObject(mergedProperties),
    });

    if (entry.properties && !Object.keys(entry.properties).length) {
      delete entry.properties;
    }

    results.push(entry);

    if (results.length >= MAX_INTERACTIVE_ELEMENTS) break;
  }

  return results.map((entry, index) => ({ ...entry, index }));
}

function extractLandmarksFromAxNodes(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return [];

  const results = [];

  for (const node of nodes) {
    if (!node || node.ignored) continue;

    const role = getRole(node);
    const roleKey = getRoleKey(node);
    if (!LANDMARK_ROLE_KEYS.has(roleKey)) continue;

    const name = getAccessibleName(node);
    const description = getAccessibleDescription(node);

    results.push(
      compactObject({
        role,
        ariaLabel: name,
        description,
        backendNodeId: node.backendDOMNodeId || undefined,
        domNodeId: node.domNodeId || undefined,
        ref: node.nodeId || undefined,
      }),
    );

    if (results.length >= MAX_LANDMARKS) break;
  }

  return results;
}

function extractHeadingsFromAxNodes(nodes) {
  if (!Array.isArray(nodes) || !nodes.length) return [];

  const results = [];

  for (const node of nodes) {
    if (!node || node.ignored) continue;
    if (getRoleKey(node) !== 'heading') continue;

    const properties = axEntriesToObject(node.properties);
    const name = getAccessibleName(node);
    const value = axValueToPrimitive(node?.value);
    const level = properties.level || properties.headingLevel || properties.hierarchicalLevel;
    const text = name || (typeof value === 'string' ? value : undefined);

    results.push(
      compactObject({
        level: typeof level === 'number' ? `H${level}` : level || 'heading',
        text,
        name: text,
        backendNodeId: node.backendDOMNodeId || undefined,
        domNodeId: node.domNodeId || undefined,
        ref: node.nodeId || undefined,
      }),
    );

    if (results.length >= 30) break;
  }

  return results;
}

function mergeInteractiveLists(axInteractive, domInteractive) {
  const fallback = Array.isArray(domInteractive) ? domInteractive : [];
  if (!Array.isArray(axInteractive) || !axInteractive.length) {
    return fallback;
  }
  if (!fallback.length) {
    return axInteractive.map((entry, index) => ({ ...entry, index }));
  }

  const fallbackMap = new Map();
  for (const item of fallback) {
    if (!item) continue;
    const key = `${(item.role || '').toLowerCase()}::${(item.label || item.name || '').toLowerCase()}`;
    if (!fallbackMap.has(key)) fallbackMap.set(key, item);
  }

  const merged = axInteractive.map((item) => {
    const key = `${(item.role || '').toLowerCase()}::${(item.label || item.name || '').toLowerCase()}`;
    const fallbackItem = fallbackMap.get(key);
    if (fallbackItem) {
      return { ...fallbackItem, ...item };
    }
    return item;
  });

  return merged.map((entry, index) => ({ ...entry, index }));
}

function mergeLandmarks(axLandmarks, domLandmarks) {
  const fallback = Array.isArray(domLandmarks) ? domLandmarks : [];
  if (!Array.isArray(axLandmarks) || !axLandmarks.length) {
    return fallback;
  }
  if (!fallback.length) {
    return axLandmarks;
  }

  const fallbackMap = new Map();
  for (const item of fallback) {
    if (!item) continue;
    const key = `${(item.role || '').toLowerCase()}::${(item.id || item.ariaLabel || '')}`;
    if (!fallbackMap.has(key)) fallbackMap.set(key, item);
  }

  return axLandmarks.map((item) => {
    const key = `${(item.role || '').toLowerCase()}::${item.ariaLabel || ''}`;
    const fallbackItem = fallbackMap.get(key);
    return fallbackItem ? { ...fallbackItem, ...item } : item;
  });
}

function mergeHeadings(domHeadings = [], axHeadings = []) {
  const merged = [];
  const seen = new Set();
  const combined = [];

  if (Array.isArray(domHeadings)) combined.push(...domHeadings);
  if (Array.isArray(axHeadings)) combined.push(...axHeadings);

  for (const heading of combined) {
    if (!heading) continue;
    const level = heading.level || heading.tag || heading.role || '';
    const text = heading.text || heading.name || '';
    const key = `${String(level).toLowerCase()}::${text.toLowerCase()}`;
    if (seen.has(key)) continue;

    const normalized = { ...heading };
    if (typeof normalized.level === 'number') {
      normalized.level = `H${normalized.level}`;
    }
    if (!normalized.text && normalized.name) {
      normalized.text = normalized.name;
    }

    merged.push(normalized);
    seen.add(key);

    if (merged.length >= 40) break;
  }

  return merged;
}

export function attachDebugger(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.attach(target, DEBUGGER_PROTOCOL_VERSION, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

export function detachDebugger(target) {
  return new Promise((resolve, reject) => {
    chrome.debugger.detach(target, () => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

export function sendDebuggerCommand(target, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(target, method, params, (result) => {
      const error = chrome.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Build a mapping from accessibility refs to CSS selectors using backendNodeId
 * @param {Array} nodes - Accessibility tree nodes
 * @param {Object} target - Debugger target { tabId }
 * @returns {Promise<Object>} Map of ref IDs to CSS selectors
 */
async function buildRefToSelectorMap(nodes, target) {
  const refMap = {};

  console.log(`[RefMap] Building mapping for ${nodes.length} total accessibility nodes`);

  // Debug: Log first few nodeIds to see their format
  const sampleNodeIds = nodes.slice(0, 5).map(n => n.nodeId);
  console.log(`[RefMap] Sample raw nodeIds from accessibility tree:`, sampleNodeIds);

  let mappedCount = 0;
  let skippedCount = 0;

  // Process ALL nodes to ensure ref counter stays in sync
  for (const node of nodes) {
    try {
      // Skip ignored nodes (these don't get refs in serializeAxNode either)
      if (node.ignored) {
        continue;
      }

      const backendNodeId = node.backendDOMNodeId || node.domNodeId;
      if (!backendNodeId) {
        skippedCount++;
        continue;
      }

      // Stop after mapping enough nodes for performance
      if (mappedCount >= 2000) {
        break;
      }

      // Use the same formatted ref that serializeAxNode produces
      // This uses currentAxRefMap which was populated during tree serialization
      const refId = formatAccessibleRef(node.nodeId);
      if (!refId) {
        skippedCount++;
        continue;
      }

      // Debug: Log ref mapping for first few nodes
      if (mappedCount < 5) {
        console.log(`[RefMap] Mapping node: raw=${node.nodeId} → formatted=${refId}, backendNodeId=${backendNodeId}`);
      }

      // Use DOM.describeNode to get selector information
      const description = await sendDebuggerCommand(target, 'DOM.describeNode', {
        backendNodeId,
      });

      if (description?.node) {
        const domNode = description.node;

        // Build CSS selector from node info
        let selector = null;

        if (domNode.nodeName) {
          const tagName = domNode.nodeName.toLowerCase();

          // Parse attributes
          const attrs = {};
          if (domNode.attributes) {
            for (let i = 0; i < domNode.attributes.length; i += 2) {
              const key = domNode.attributes[i];
              const value = domNode.attributes[i + 1];
              attrs[key] = value;
            }
          }

          // Priority 1: Use ID if available (most specific)
          if (attrs.id) {
            selector = `#${attrs.id}`;
          }
          // Priority 2: For links, use href attribute (very specific for navigation)
          else if (tagName === 'a' && attrs.href) {
            selector = `a[href="${attrs.href}"]`;
          }
          // Priority 3: Use unique attributes like data-* or name
          else if (attrs['data-testid']) {
            selector = `${tagName}[data-testid="${attrs['data-testid']}"]`;
          }
          else if (attrs.name) {
            selector = `${tagName}[name="${attrs.name}"]`;
          }
          // Priority 4: Use aria-label for buttons/interactive elements
          else if (attrs['aria-label']) {
            selector = `${tagName}[aria-label="${attrs['aria-label']}"]`;
          }
          // Priority 5: Use class if available
          else if (attrs.class) {
            const classes = attrs.class.split(/\s+/).filter(c => c && !c.match(/^(active|hover|focus|selected)$/));
            if (classes.length > 0) {
              selector = `${tagName}.${classes[0]}`;
            }
          }

          // Fallback: just use tag name (not very specific but better than nothing)
          if (!selector) {
            selector = tagName;
          }
        }

        if (selector) {
          refMap[refId] = `css:${selector}`;
          mappedCount++;
        }
      }
    } catch (err) {
      // Silently skip nodes that can't be mapped
      continue;
    }
  }

  const refKeys = Object.keys(refMap);
  console.log(`[RefMap] Successfully mapped ${mappedCount} refs to selectors (skipped ${skippedCount} nodes without backendNodeId)`);
  console.log(`[RefMap] Sample stored refs:`, refKeys.slice(0, 10));
  console.log(`[RefMap] Sample stored refs (last 10):`, refKeys.slice(-10));
  return refMap;
}

async function captureAccessibilityTree(tabId) {
  if (!chrome?.debugger?.attach) {
    return null;
  }

  resetAccessibleRefMap();

  const target = { tabId };

  try {
    await attachDebugger(target);
  } catch (error) {
    console.warn('[snapshot] debugger attach failed', error);
    return null;
  }

  try {
    await sendDebuggerCommand(target, 'Accessibility.enable');
    await sendDebuggerCommand(target, 'DOM.enable');

    const response = await sendDebuggerCommand(target, 'Accessibility.getFullAXTree', {
      maxDepth: MAX_TREE_DEPTH + 2,
      fetchRelatives: true,
    });

    const nodes = Array.isArray(response?.nodes) ? response.nodes : [];
    if (!nodes.length) {
      return null;
    }

    const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

    const root =
      nodes.find((node) => !node.ignored && ['rootwebarea', 'webarea'].includes(getRoleKey(node))) ||
      nodes.find((node) => !node.ignored) ||
      nodes[0];

    const serializedTree = serializeAxNode(root, nodeMap, 0);
    const tree = Array.isArray(serializedTree)
      ? serializedTree[0] || null
      : serializedTree || null;
    const interactive = extractInteractiveFromAxNodes(nodes);
    const landmarks = extractLandmarksFromAxNodes(nodes);
    const headings = extractHeadingsFromAxNodes(nodes);

    // Build reference mapping for automation
    const rawRefMap = await buildRefToSelectorMap(nodes, target);
    const refMap = rawRefMap;

    return {
      tree,
      interactive,
      landmarks,
      headings,
      refMap, // Include the mapping
    };
  } catch (error) {
    console.warn('[snapshot] accessibility capture failed', error);
    return null;
  } finally {
    try {
      await detachDebugger(target);
    } catch (error) {
      console.warn('[snapshot] debugger detach failed', error);
    }
  }
}

async function captureRawSnapshot(tabId, fullPage = true) {
  let domSnapshot = null;
  try {
    domSnapshot = await captureDomSnapshot(tabId, fullPage);
  } catch (error) {
    console.warn('[snapshot] DOM snapshot failed', error);
  }

  if (!domSnapshot) {
    domSnapshot = {
      url: null,
      title: null,
      description: null,
      aria: { tree: null, interactive: [], landmarks: [] },
      links: [],
      images: [],
      forms: [],
      headings: [],
      timestamp: new Date().toISOString(),
    };
  }

  const fallbackAria = domSnapshot.aria || { tree: null, interactive: [], landmarks: [] };
  const accessibility = await captureAccessibilityTree(tabId);

  if (accessibility) {
    // Prefer DOM tree over accessibility tree because DOM tree has usable CSS refs
    // Accessibility tree has abstract refs like s1e199 which can't be used for automation
    const tree = fallbackAria.tree || accessibility.tree || null;
    const interactive = mergeInteractiveLists(accessibility.interactive, fallbackAria.interactive);
    const landmarks = mergeLandmarks(accessibility.landmarks, fallbackAria.landmarks);

    domSnapshot.aria = {
      tree,
      interactive,
      landmarks,
    };

    domSnapshot.headings = mergeHeadings(domSnapshot.headings, accessibility.headings);

    // Store the reference mapping for automation if available
    if (accessibility.refMap && Object.keys(accessibility.refMap).length > 0) {
      domSnapshot.refMap = accessibility.refMap;
      try {
        setElementRefMap(tabId, accessibility.refMap, {
          url: domSnapshot.url,
          timestamp: Date.now(),
        });
      } catch (err) {
        console.warn('[snapshot] Failed to store reference map:', err);
      }
    }
  } else if (!domSnapshot.aria) {
    domSnapshot.aria = fallbackAria;
  }

  return domSnapshot;
}

export async function captureSnapshotForTab(tabId, fullPage = true) {
  try {
    const nextSequence = snapshotSequenceByTab.get(tabId) ?? 1;
    currentSnapshotPrefix = `s${nextSequence}`;
    const snapshot = await captureRawSnapshot(tabId, fullPage);
    if (!snapshot) {
      throw new Error('Snapshot capture returned empty result');
    }

    snapshot.snapshotId = currentSnapshotPrefix;
    snapshot.tabId = tabId;

    const existing = snapshotIdsByTab.get(tabId) || new Set();
    existing.add(snapshot.snapshotId);
    snapshotIdsByTab.set(tabId, existing);

    snapshotCache.set(snapshot.snapshotId, snapshot);
    snapshotSequenceByTab.set(tabId, nextSequence + 1);
    return snapshot;
  } catch (error) {
    throw createErrorResult('Snapshot capture failed', error);
  }
}

export async function captureSnapshotResponse({ tabId, status, details = [], fallbackUrl, fullPage = true }) {
  try {
    const snapshot = await captureSnapshotForTab(tabId, fullPage);
    if (!snapshot) {
      throw new Error('Snapshot returned empty result');
    }

    const extraDetails = [...details];
    if (snapshot.snapshotId) {
      extraDetails.unshift(`Snapshot ID: ${snapshot.snapshotId}`);
    }

    const text = buildSnapshotText(snapshot, status, extraDetails);
    const urls = [];
    if (snapshot.url) urls.push(snapshot.url);
    else if (fallbackUrl) urls.push(fallbackUrl);

    const meta = {};
    if (urls.length) meta.urls = urls;
    if (typeof tabId === 'number') meta.tabId = tabId;

    return {
      ok: true,
      content: [
        {
          type: 'text',
          text,
        },
      ],
      _meta: Object.keys(meta).length ? meta : undefined,
      snapshot,
    };
  } catch (error) {
    if (error?.ok === false && error.content) {
      return error;
    }
    return createErrorResult('Snapshot failed', error);
  }
}

export async function ensureTabForSnapshot(params = {}) {
  const { toolName = 'snapshot', preferredUrl } = params;
  const selection = await selectTab({ toolName, preferredUrl });
  if (!selection.ok) {
    return createErrorResult(`${toolName} tab selection failed`, selection.error);
  }
  return selection;
}

export { createErrorResult, formatSnapshotAsYAML };
