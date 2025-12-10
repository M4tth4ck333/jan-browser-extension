// snapshot-utils.js
// Shared helpers for building ARIA snapshot responses that match the MCP server

import { selectTab } from '../lib/tab-manager.js';
import { isCodeEditorElement, getCodeEditorMeta } from './code-mirror-utils.js';
import { clearElementRefMap, getElementRefMap, setElementRefMap } from '../lib/element-ref-map.js';

const DEBUGGER_PROTOCOL_VERSION = '1.3';

const SNAPSHOT_PRESETS = {
  shallow: { domDepth: 8, axDepth: 8, maxChildren: 80, maxInteractive: 120, maxLandmarks: 40, maxPerFrame: 100 },
  medium: { domDepth: 16, axDepth: 16, maxChildren: 160, maxInteractive: 300, maxLandmarks: 120, maxPerFrame: 200 },
  deep: { domDepth: 64, axDepth: 64, maxChildren: 240, maxInteractive: 800, maxLandmarks: 240, maxPerFrame: 300 },
  all: {
    domDepth: Number.POSITIVE_INFINITY,
    axDepth: Number.POSITIVE_INFINITY,
    maxChildren: Number.POSITIVE_INFINITY,
    maxInteractive: Number.POSITIVE_INFINITY,
    maxLandmarks: Number.POSITIVE_INFINITY,
    maxPerFrame: Number.POSITIVE_INFINITY,
  },
};

function getSnapshotLimits(detailLevel = 'medium') {
  const key = typeof detailLevel === 'string' ? detailLevel.toLowerCase() : 'medium';
  return SNAPSHOT_PRESETS[key] || SNAPSHOT_PRESETS.medium;
}

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
let currentFrameOrdinal = 0; // Track current frame being processed
const snapshotCache = new Map();
const snapshotIdsByTab = new Map();
const snapshotSequenceByTab = new Map();
let navigationListenersRegistered = false;
let snapshotLimits = SNAPSHOT_PRESETS.deep;

function setSnapshotLimits(level = 'medium') {
  if (typeof level === 'string') {
    snapshotLimits = getSnapshotLimits(level);
  } else if (level && typeof level === 'object') {
    snapshotLimits = level;
  } else {
    snapshotLimits = SNAPSHOT_PRESETS.medium;
  }
}

function getCurrentLimits() {
  return snapshotLimits || SNAPSHOT_PRESETS.medium;
}

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
  currentFrameOrdinal = 0;
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

async function captureDomSnapshot(tabId, fullPage = true, limits = null) {
  const snapshotLimits = limits || getSnapshotLimits('deep');
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (fullPage, limits) => {
      // Helper function to get snapshot limits (passed as argument)
      const getCurrentLimits = () => limits;

      // CodeMirror detection helpers (must be defined inside injected script)
      const isCodeEditorElement = (element) => {
        if (!element) return false;
        const className = typeof element.className === 'string' ? element.className : '';
        if (className && /(codemirror|cm-editor|cm-content)/i.test(className)) {
          return true;
        }
        try {
          return Boolean(element.closest?.('.CodeMirror, .cm-editor, [data-codemirror]'));
        } catch (_) {
          return false;
        }
      };

      const getCodeEditorMeta = (element) => {
        if (!isCodeEditorElement(element)) return null;

        let root = element;
        try {
          root = element.closest?.('.CodeMirror, .cm-editor, [data-codemirror]') || element;
        } catch (_) {
          // ignore
        }

        const textarea = root?.querySelector?.(
          'textarea[aria-label], textarea[placeholder], textarea[name], textarea[id]',
        );

        const label =
          root?.getAttribute?.('aria-label') ||
          root?.getAttribute?.('data-placeholder') ||
          root?.getAttribute?.('placeholder') ||
          textarea?.getAttribute?.('aria-label') ||
          textarea?.getAttribute?.('placeholder') ||
          textarea?.name ||
          textarea?.id ||
          '';

        const content =
          root?.querySelector?.('.cm-content') ||
          root?.querySelector?.('.CodeMirror-code') ||
          root?.querySelector?.('[contenteditable="true"]');
        const text = (content?.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 240);

        return { label, text };
      };

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

        if (isCodeEditorElement(element)) return 'textbox';

        const tag = element.tagName;
        if (tag === 'A') return 'link';
        if (tag === 'BUTTON') return 'button';
        if (tag === 'SELECT') return 'listbox';
        if (tag === 'OPTION') return 'option';
        if (tag === 'LI') return 'listitem';
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

      const buildAriaTree = (element, depth = 0, maxDepth = getCurrentLimits().domDepth, inShadow = false) => {
        if (!element || depth > maxDepth) return null;

        const role = inferRole(element);
        const codeMeta = getCodeEditorMeta(element);
        const isCodeEditor = Boolean(codeMeta);
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
              children: children.slice(0, getCurrentLimits().maxChildren),
            };
          }
          return null;
        }

        const textContent = element.textContent?.trim() || '';
        const codeLabel = codeMeta?.label || '';
        const codeValue = (() => {
          if (!isCodeEditor) return '';
          const metaText = (codeMeta?.text || '').trim();
          if (metaText) return metaText;
          const inner = typeof element.innerText === 'string' ? element.innerText.trim().replace(/\s+/g, ' ') : '';
          if (inner) return inner;
          const text = typeof element.textContent === 'string' ? element.textContent.trim().replace(/\s+/g, ' ') : '';
          return text;
        })();
        const ariaLabel =
          element.getAttribute('aria-label') ||
          element.getAttribute('aria-labelledby') ||
          element.getAttribute('title') ||
          (role === 'link' || role === 'button' ? textContent.slice(0, 100) : '');

        const node = {
          role,
          name:
            (codeValue ? codeValue.slice(0, 120) : '') ||
            ariaLabel ||
            codeLabel ||
            textContent.slice(0, 50) ||
            (isCodeEditor ? 'Code editor' : '') ||
            '',
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
        const textValue = codeValue || (isCodeEditor ? textContent : '');
        if (textValue) {
          node.value = textValue;
          node.text = textValue;
          node.description = textValue;
        } else if (isCodeEditor && !node.value) {
          const fallback = textContent || codeLabel;
          if (fallback) {
            node.value = fallback;
            node.text = fallback;
            node.description = fallback;
          }
        }

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

        if (children.length) node.children = children.slice(0, getCurrentLimits().maxChildren);

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

          // Explicitly surface CodeMirror editors that may not match default selectors
          const codeEditors = Array.from(root.querySelectorAll('.CodeMirror, .cm-editor, .cm-content, [data-codemirror]'));
          for (const editor of codeEditors) {
            const target =
              editor.querySelector?.('.cm-content[contenteditable], .cm-content, .CodeMirror-code, textarea, [contenteditable="true"]') ||
              editor;
            if (!target || visited.has(target)) continue;
            visited.add(target);
            if (!shouldIncludeElement(target)) continue;
            if (results.length >= 50) return;

            const meta = getCodeEditorMeta(target);
            const valuePreview =
              (meta?.text && meta.text.trim()) ||
              (typeof target.innerText === 'string' ? target.innerText.trim().replace(/\s+/g, ' ') : '') ||
              (typeof target.textContent === 'string' ? target.textContent.trim().replace(/\s+/g, ' ') : '') ||
              '';
            const label =
              (valuePreview ? valuePreview.slice(0, 120) : '') ||
              meta?.label ||
              target.getAttribute?.('aria-label') ||
              target.getAttribute?.('placeholder') ||
              'Code editor';

            const item = {
              index: results.length,
              role: 'textbox',
              tag: target.tagName?.toLowerCase() || 'div',
              label,
              id: target.id || undefined,
              name: target.name || undefined,
              ref: buildElementRef(target) || undefined,
              className: typeof target.className === 'string' ? target.className : undefined,
            };

            if (valuePreview) {
              item.value = valuePreview;
            }

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
    args: [fullPage, snapshotLimits],
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

function formatAccessibleRef(nodeId, frameOrdinal = null) {
  if (nodeId === undefined || nodeId === null) {
    return undefined;
  }

  if (!currentAxRefMap.has(nodeId)) {
    // Generate ref with frame ordinal for iframe elements
    // Main frame (f0): s1e1, s1e2, etc.
    // Iframe 1 (f1): s1f1e1, s1f1e2, etc.
    // Iframe 2 (f2): s1f2e1, s1f2e2, etc.
    const frame = frameOrdinal !== null ? frameOrdinal : currentFrameOrdinal;
    const framePart = frame > 0 ? `f${frame}` : '';
    const refId = `${currentSnapshotPrefix}${framePart}e${currentAxRefCounter}`;
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
  const properties = axEntriesToObject(node.properties);
  const state = axEntriesToObject(node.state);
  const focusable = properties.focusable === true || properties.focusable === 'true' || state.focused === true;
  const actionable = properties.clickable === true || (Array.isArray(node.actions) && node.actions.length > 0);

  if (node.ignored && !focusable && !actionable) return true;

  const roleKey = getRoleKey(node);
  if (!roleKey && !focusable && !actionable) return true;

  if (
    roleKey === 'presentation' ||
    roleKey === 'none' ||
    roleKey === 'text' ||
    roleKey === 'statictext' ||
    roleKey === 'inlinetextbox'
  ) {
    return true;
  }

  if (roleKey === 'generic') {
    const hasName = node.name?.value && node.name.value.trim().length > 0;
    const hasActions = Array.isArray(node.actions) && node.actions.length > 0;
    const hasValue = node.value?.value !== undefined && node.value.value !== '';
    if (focusable || actionable) return false;
    if (hasActions || hasValue) return false;
    if (!hasName) return true;
    return false;
  }

  if (roleKey === 'group') {
    const hasActions = Array.isArray(node.actions) && node.actions.length > 0;
    const hasName = node.name?.value && node.name.value.trim().length > 0;
    if (focusable || actionable) return false;
    if (!hasActions && !hasName) return true;
    return false;
  }

  return false;
}

function serializeAxNode(node, map, depth = 0) {
  if (!node || depth > getCurrentLimits().axDepth) return [];

  const includeNode = !shouldFlattenAxNode(node);
  const nextDepth = includeNode ? depth + 1 : depth;

  const rawRole = getRole(node);
  const role = normalizeAxRole(rawRole) || rawRole;
  const name = getImprovedAccessibleName(node);
  const description = getAccessibleDescription(node);
  const value = axValueToPrimitive(node?.value);
  const rawProperties = axEntriesToObject(node.properties);
  const rawState = axEntriesToObject(node.state);

  let effectiveName = name;
  let effectiveValue = value;

  // For CodeMirror-like textboxes with poor names, fall back to value/placeholder/description
  if ((role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'generic') && (!effectiveName || isUnhelpfulLabel(effectiveName, role))) {
    const placeholder = rawProperties?.placeholder || rawProperties?.['aria-placeholder'] || rawProperties?.title;
    const valueFromProps = rawProperties?.value || rawProperties?.text || rawProperties?.label;
    const candidate = description || placeholder || valueFromProps || value;
    if (candidate && typeof candidate === 'string' && candidate.trim()) {
      effectiveName = candidate;
    } else if (value && typeof value === 'string' && value.trim()) {
      effectiveName = value;
    }
  }

  if (!effectiveValue && typeof rawProperties?.value === 'string' && rawProperties.value.trim()) {
    effectiveValue = rawProperties.value;
  }

  // If we have real text in the value, prefer it as the name for text inputs/editors
  if (
    effectiveValue &&
    typeof effectiveValue === 'string' &&
    (role === 'textbox' || role === 'searchbox' || role === 'combobox' || role === 'generic')
  ) {
    effectiveName = effectiveValue;
  }

  if (!effectiveName && (role === 'textbox' || role === 'generic')) {
    effectiveName = 'Code editor';
  }

  let serialized = null;

  if (includeNode) {
    serialized = compactObject({
      id: formatAccessibleRef(node.nodeId),
      ref: formatAccessibleRef(node.nodeId),
      axNodeId: node.nodeId,
      role,
      name: effectiveName,
      description: description || effectiveValue,
      value: effectiveValue,
    });

    if (Array.isArray(node.actions) && node.actions.length) {
      serialized.actions = node.actions.slice(0, 6);
    }

    const properties = compactObject(rawProperties);
    const state = compactObject(rawState);

    if (Object.keys(properties).length) serialized.properties = properties;
    if (Object.keys(state).length) serialized.state = state;

    // Ensure text surfaces in snapshot output for editors
    if (effectiveValue && !serialized.text) {
      serialized.text = effectiveValue;
    }

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
          if (children.length >= getCurrentLimits().maxChildren) break;
        }
      }
      if (children.length >= getCurrentLimits().maxChildren) break;
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

function extractInteractiveFromAxNodes(nodes, limit) {
  if (!Array.isArray(nodes) || !nodes.length) return [];

  const results = [];
  const maxLimit = limit !== undefined ? limit : getCurrentLimits().maxInteractive;

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

    if (results.length >= maxLimit) break;
  }

  return results.map((entry, index) => ({ ...entry, index }));
}

function extractLandmarksFromAxNodes(nodes, limit) {
  if (!Array.isArray(nodes) || !nodes.length) return [];

  const results = [];
  const maxLimit = limit !== undefined ? limit : getCurrentLimits().maxLandmarks;

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

    if (results.length >= maxLimit) break;
  }

  return results;
}

function extractHeadingsFromAxNodes(nodes, limit) {
  if (!Array.isArray(nodes) || !nodes.length) return [];

  const maxLimit = limit !== undefined ? limit : 9999; // No global limit for headings, only per-frame

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

    if (results.length >= maxLimit) break;
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
 * This must be called AFTER serializeAxNode so that currentAxRefMap is populated
 * @param {Array} nodes - Accessibility tree nodes from all frames
 * @param {Object} target - Debugger target { tabId }
 * @param {Array} frameResults - Array of frame data with frameId info
 * @returns {Promise<Object>} Map of ref IDs to CSS selectors
 */
async function buildRefToSelectorMap(nodes, target, frameResults = []) {
  const refMap = {};
  const startTime = performance.now();

  console.log(`[RefMap] Building mapping for ${nodes.length} total accessibility nodes across ${frameResults.length || 1} frames`);

  // Map child index and parent ref for each node for better targeting (e.g., virtualized lists)
  const childIndexByNodeId = new Map();
  const parentRefByNodeId = new Map();
  for (const node of nodes) {
    if (Array.isArray(node.childIds)) {
      node.childIds.forEach((childId, idx) => {
        childIndexByNodeId.set(childId, idx);
        parentRefByNodeId.set(childId, currentAxRefMap.get(node.nodeId) || null);
      });
    }
  }

  // Create a map of node to frameId for iframe nodes
  const nodeToFrameId = new Map();
  if (frameResults.length > 0) {
    for (const frameData of frameResults) {
      if (frameData.nodes && frameData.frameId) {
        for (const node of frameData.nodes) {
          nodeToFrameId.set(node.nodeId, frameData.frameId);
        }
      }
    }
  }

  // Pre-filter nodes to only those with refs
  const nodesToMap = [];
  const nodesWithoutBackendId = [];

  for (const node of nodes) {
    if (node.ignored) continue;

    const refId = currentAxRefMap.get(node.nodeId);
    if (!refId) continue;

    const backendNodeId = node.backendDOMNodeId || node.domNodeId;
    const frameId = nodeToFrameId.get(node.nodeId);
    const childIndex = childIndexByNodeId.get(node.nodeId);
    const parentRef = parentRefByNodeId.get(node.nodeId) || null;

    if (backendNodeId) {
      nodesToMap.push({ node, refId, backendNodeId, frameId, childIndex, parentRef });
    } else {
      // Store ref even without backendNodeId - it won't have CSS selector but can still be referenced
      nodesWithoutBackendId.push({ refId, frameId, childIndex, parentRef });
    }
  }

  console.log(`[RefMap] Processing ${nodesToMap.length} nodes with backend IDs, ${nodesWithoutBackendId.length} without`);

  // Batch parallel requests with concurrency control
  const BATCH_SIZE = 50;
  let cssCount = 0;
  let backendCount = 0;

  if (nodesToMap.length > 1000) {
    console.warn(`[RefMap] Large ref map (${nodesToMap.length} nodes) – mapping all refs; may take a moment`);
  }

  for (let i = 0; i < nodesToMap.length; i += BATCH_SIZE) {
    const batch = nodesToMap.slice(i, i + BATCH_SIZE);

    const descriptions = await Promise.allSettled(
      batch.map(({ backendNodeId, frameId }) => {
        const params = { backendNodeId };
        // Add frameId for iframe nodes to ensure correct context
        if (frameId) {
          params.frameId = frameId;
        }
        return sendDebuggerCommand(target, 'DOM.describeNode', params);
      })
    );

    // Process results
    descriptions.forEach((result, idx) => {
      const { refId, backendNodeId, frameId, childIndex, parentRef } = batch[idx];

      if (result.status === 'rejected' || !result.value?.node) {
        refMap[refId] = { backend: backendNodeId };
        if (frameId) {
          refMap[refId].frameId = frameId;
        }
        if (parentRef) refMap[refId].parentRef = parentRef;
        if (childIndex !== undefined) refMap[refId].childIndex = childIndex;
        backendCount++;
        return;
      }

      const domNode = result.value.node;
      const selector = buildCssSelector(domNode);

      if (selector) {
        refMap[refId] = { css: `css:${selector}`, backend: backendNodeId };
        if (frameId) {
          refMap[refId].frameId = frameId;
        }
        if (parentRef) refMap[refId].parentRef = parentRef;
        if (childIndex !== undefined) refMap[refId].childIndex = childIndex;
        cssCount++;
      } else {
        refMap[refId] = { backend: backendNodeId };
        if (frameId) {
          refMap[refId].frameId = frameId;
        }
        if (parentRef) refMap[refId].parentRef = parentRef;
        if (childIndex !== undefined) refMap[refId].childIndex = childIndex;
        backendCount++;
      }
    });
  }

  // Add refs without backend IDs (won't have selectors, but still referenceable)
  for (const { refId, frameId, childIndex, parentRef } of nodesWithoutBackendId) {
    refMap[refId] = { placeholder: true }; // Mark as placeholder - no selector available
    if (frameId) {
      refMap[refId].frameId = frameId;
    }
    if (parentRef) refMap[refId].parentRef = parentRef;
    if (childIndex !== undefined) refMap[refId].childIndex = childIndex;
  }

  const totalRefs = cssCount + backendCount + nodesWithoutBackendId.length;
  const elapsed = Math.round(performance.now() - startTime);
  console.log(`[RefMap] Mapped ${totalRefs} refs in ${elapsed}ms (${cssCount} CSS, ${backendCount} backend, ${nodesWithoutBackendId.length} placeholder)`);

  if (backendCount > cssCount) {
    console.warn(`[RefMap] Warning: More backend refs than CSS refs - visual overlay limited`);
  }

  return refMap;
}

function buildCssSelector(domNode) {
  if (!domNode.nodeName) return null;

  const tagName = domNode.nodeName.toLowerCase();
  const attrs = parseAttributes(domNode.attributes);

  if (attrs.id) return `#${attrs.id}`;
  if (tagName === 'a' && attrs.href) return `a[href="${attrs.href}"]`;
  if (attrs['data-testid']) return `${tagName}[data-testid="${attrs['data-testid']}"]`;
  if (attrs.name) return `${tagName}[name="${attrs.name}"]`;
  if (attrs['aria-label']) return `${tagName}[aria-label="${attrs['aria-label']}"]`;

  if (attrs.class) {
    const classes = attrs.class.split(/\s+/).filter(c => c && !c.match(/^(active|hover|focus|selected)$/));
    if (classes.length > 0) return `${tagName}.${classes[0]}`;
  }

  if ((tagName === 'option' || tagName === 'input') && attrs.value !== undefined) {
    return `${tagName}[value="${attrs.value}"]`;
  }

  return null;
}

function parseAttributes(attrArray) {
  const attrs = {};
  if (!attrArray) return attrs;

  for (let i = 0; i < attrArray.length; i += 2) {
    attrs[attrArray[i]] = attrArray[i + 1];
  }
  return attrs;
}

/**
 * Merge iframe content into the main tree by finding iframe nodes and injecting their content
 * @param {Object} tree - Main frame tree
 * @param {Map} frameTreeMap - Map of frameId -> iframe tree
 * @param {Map} backendNodeToFrameId - Map of backendNodeId -> frameId for iframe elements
 * @returns {Object} Merged tree with iframe content as children of iframe nodes
 */
function mergeIframeContent(tree, frameTreeMap, backendNodeToFrameId) {
  if (!tree) return tree;

  // Clone the tree to avoid mutating the original
  const merged = { ...tree };

  // If this is an iframe node, try to inject its content
  if (merged.role === 'iframe' || merged.role === 'Iframe') {
    // Look up frameId using backendNodeId
    const backendId = merged.backendNodeId;
    const frameId = backendId ? backendNodeToFrameId.get(backendId) : null;

    if (frameId && frameTreeMap.has(frameId)) {
      const iframeTree = frameTreeMap.get(frameId);
      console.log(`[snapshot] Merging iframe content for frameId: ${frameId} (backendNodeId: ${backendId})`);

      // Add iframe content as children
      if (iframeTree) {
        merged.children = merged.children || [];
        // Inject the iframe's tree as children
        if (Array.isArray(iframeTree.children)) {
          merged.children.push(...iframeTree.children);
        } else {
          merged.children.push(iframeTree);
        }
      }
    }
  }

  // Recursively process children
  if (Array.isArray(merged.children)) {
    merged.children = merged.children.map(child =>
      mergeIframeContent(child, frameTreeMap, backendNodeToFrameId)
    );
  }

  return merged;
}

/**
 * Recursively collect all frames from frame tree in depth-first order
 * @param {Object} frameTree - Frame tree from Page.getFrameTree
 * @param {Array} frames - Accumulated array of frames
 * @returns {Array} Array of frame objects with ordinal
 */
function collectFrames(frameTree, frames = []) {
  if (!frameTree?.frame) return frames;

  // Add current frame with ordinal
  const frameOrdinal = frames.length;
  frames.push({
    frameId: frameTree.frame.id,
    ordinal: frameOrdinal,
    url: frameTree.frame.url,
    name: frameTree.frame.name,
    securityOrigin: frameTree.frame.securityOrigin,
  });

  // Recursively process child frames (depth-first)
  if (Array.isArray(frameTree.childFrames)) {
    for (const childFrame of frameTree.childFrames) {
      collectFrames(childFrame, frames);
    }
  }

  return frames;
}

/**
 * Capture accessibility tree for a specific frame
 * @param {Object} target - Debugger target { tabId }
 * @param {String} frameId - Frame ID to capture (null for main frame)
 * @param {Number} frameOrdinal - Frame ordinal for ref generation
 * @returns {Object} Frame accessibility data
 */
async function captureFrameAccessibilityTree(target, frameId, frameOrdinal) {
  try {
    // Set current frame ordinal for ref generation
    currentFrameOrdinal = frameOrdinal;

    const params = {
      maxDepth: getCurrentLimits().axDepth + 2,
      fetchRelatives: true,
    };

    // Add frameId if capturing iframe (null/undefined for main frame)
    if (frameId) {
      params.frameId = frameId;
    }

    const response = await sendDebuggerCommand(target, 'Accessibility.getFullAXTree', params);

    const nodes = Array.isArray(response?.nodes) ? response.nodes : [];
    if (!nodes.length) {
      console.log(`[snapshot] Frame ${frameOrdinal} (${frameId || 'main'}) returned no accessibility nodes`);
      return null;
    }

    console.log(`[snapshot] Frame ${frameOrdinal} (${frameId || 'main'}) captured ${nodes.length} accessibility nodes`);

    const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

    const root =
      nodes.find((node) => !node.ignored && ['rootwebarea', 'webarea'].includes(getRoleKey(node))) ||
      nodes.find((node) => !node.ignored) ||
      nodes[0];

    const serializedTree = serializeAxNode(root, nodeMap, 0);
    const tree = Array.isArray(serializedTree)
      ? serializedTree[0] || null
      : serializedTree || null;

    // Apply per-frame limits for iframes (main frame uses global limits)
    const perFrameLimit = frameOrdinal > 0 ? getCurrentLimits().maxPerFrame : undefined;
    const interactive = extractInteractiveFromAxNodes(nodes, perFrameLimit);
    const landmarks = extractLandmarksFromAxNodes(nodes, perFrameLimit);
    const headings = extractHeadingsFromAxNodes(nodes, perFrameLimit);

    return {
      frameOrdinal,
      frameId: frameId || null,
      tree,
      nodes, // Keep nodes for ref map building
      interactive,
      landmarks,
      headings,
    };
  } catch (error) {
    console.warn(`[snapshot] Frame ${frameOrdinal} (${frameId || 'main'}) accessibility capture failed:`, error);
    return null;
  }
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
    await sendDebuggerCommand(target, 'Page.enable');
    await sendDebuggerCommand(target, 'Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true, // Get all targets in flat list including OOPIFs
    });

    // Get frame tree to discover all iframes (including OOPIFs)
    let frames = [];
    try {
      const frameTreeResponse = await sendDebuggerCommand(target, 'Page.getFrameTree');
      if (frameTreeResponse?.frameTree) {
        frames = collectFrames(frameTreeResponse.frameTree);
        console.log(`[snapshot] Discovered ${frames.length} frames from frame tree`);
      }
    } catch (error) {
      console.warn('[snapshot] Page.getFrameTree failed, falling back to main frame only:', error);
      frames = [{ frameId: null, ordinal: 0, url: null, name: null }];
    }

    // Also try to get all frames using DOM.getDocument with pierce for OOPIFs
    try {
      const docResponse = await sendDebuggerCommand(target, 'DOM.getDocument', {
        depth: -1,
        pierce: true  // Traverse into iframes and shadow roots
      });

      if (docResponse?.root) {
        // Recursively collect all iframe frameIds from the document tree
        const iframeFrameIds = new Set();
        const collectIframeFrameIds = (node) => {
          if (node.nodeName?.toLowerCase() === 'iframe' && node.frameId) {
            iframeFrameIds.add(node.frameId);
            console.log(`[snapshot] Found iframe with frameId: ${node.frameId}, contentDocument: ${!!node.contentDocument}`);
          }
          // Also check contentDocument which is the iframe's document
          if (node.contentDocument) {
            if (node.contentDocument.frameId) {
              iframeFrameIds.add(node.contentDocument.frameId);
            }
            collectIframeFrameIds(node.contentDocument);
          }
          if (node.children) {
            for (const child of node.children) {
              collectIframeFrameIds(child);
            }
          }
        };

        collectIframeFrameIds(docResponse.root);
        console.log(`[snapshot] Found ${iframeFrameIds.size} iframe frameIds via DOM.getDocument`);

        // Add any missing frames from DOM traversal
        for (const frameId of iframeFrameIds) {
          if (!frames.some(f => f.frameId === frameId)) {
            frames.push({
              frameId: frameId,
              ordinal: frames.length,
              url: null,
              name: null,
              securityOrigin: null,
            });
          }
        }

        console.log(`[snapshot] Total frames after DOM scan: ${frames.length}`);
      }
    } catch (error) {
      console.warn('[snapshot] DOM.getDocument with pierce failed:', error);
    }

    // Capture accessibility tree for each frame
    const frameResults = [];
    for (const frame of frames) {
      const frameData = await captureFrameAccessibilityTree(target, frame.frameId, frame.ordinal);
      if (frameData) {
        frameData.url = frame.url;
        frameData.name = frame.name;
        frameResults.push(frameData);
      }
    }

    if (frameResults.length === 0) {
      console.warn('[snapshot] No frame data captured');
      return null;
    }

    // Merge data from all frames
    const mainFrame = frameResults[0];
    const allNodes = [];
    const allInteractive = [];
    const allLandmarks = [];
    const allHeadings = [];

    for (const frameData of frameResults) {
      if (frameData.nodes) {
        allNodes.push(...frameData.nodes);
      }
      if (Array.isArray(frameData.interactive)) {
        allInteractive.push(...frameData.interactive);
      }
      if (Array.isArray(frameData.landmarks)) {
        allLandmarks.push(...frameData.landmarks);
      }
      if (Array.isArray(frameData.headings)) {
        allHeadings.push(...frameData.headings);
      }
    }

    // Build reference mapping for automation (all frames)
    const rawRefMap = await buildRefToSelectorMap(allNodes, target, frameResults);
    const refMap = rawRefMap;

    console.log(`[snapshot] Captured ${frameResults.length} frames with ${allNodes.length} total nodes, ${Object.keys(refMap).length} refs`);

    // Build a map of frameId -> tree for merging
    const frameTreeMap = new Map();
    for (const frameData of frameResults) {
      if (frameData.frameId && frameData.tree) {
        frameTreeMap.set(frameData.frameId, frameData.tree);
      }
    }

    // Build a map of backendNodeId -> frameId from DOM nodes
    const backendNodeToFrameId = new Map();
    try {
      const docResponse = await sendDebuggerCommand(target, 'DOM.getDocument', {
        depth: -1,
        pierce: true
      });

      if (docResponse?.root) {
        const collectIframeBackendIds = (node) => {
          if (node.nodeName?.toLowerCase() === 'iframe') {
            const backendId = node.backendNodeId;
            const frameId = node.contentDocument?.frameId || node.frameId;
            if (backendId && frameId) {
              backendNodeToFrameId.set(backendId, frameId);
              console.log(`[snapshot] Mapped iframe backendNodeId ${backendId} -> frameId ${frameId}`);
            }
          }
          if (node.contentDocument) {
            collectIframeBackendIds(node.contentDocument);
          }
          if (node.children) {
            for (const child of node.children) {
              collectIframeBackendIds(child);
            }
          }
        };
        collectIframeBackendIds(docResponse.root);
      }
    } catch (error) {
      console.warn('[snapshot] Failed to build backendNode->frameId map:', error);
    }

    // Merge iframe content into main tree
    const mergedTree = mergeIframeContent(mainFrame.tree, frameTreeMap, backendNodeToFrameId);

    return {
      tree: mergedTree, // Merged tree with iframe content
      frames: frameResults.map(f => ({
        ordinal: f.frameOrdinal,
        frameId: f.frameId,
        url: f.url,
        name: f.name,
        tree: f.tree
      })), // Include all frame trees for reference
      interactive: allInteractive,
      landmarks: allLandmarks,
      headings: allHeadings,
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
    // Use accessibility tree with abstract refs (s1e2, s1f1e1) for consistent automation
    const tree = accessibility.tree || fallbackAria.tree || null;
    const interactive = mergeInteractiveLists(accessibility.interactive, fallbackAria.interactive);
    const landmarks = mergeLandmarks(accessibility.landmarks, fallbackAria.landmarks);

    domSnapshot.aria = {
      tree,
      interactive,
      landmarks,
    };

    domSnapshot.headings = mergeHeadings(domSnapshot.headings, accessibility.headings);

    // Store the reference mapping from accessibility tree
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

export async function captureSnapshotForTab(tabId, fullPage = true, detailLevel = 'deep') {
  const previousLimits = getCurrentLimits();
  setSnapshotLimits(detailLevel);
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
  } finally {
    setSnapshotLimits(previousLimits);
  }
}

export async function captureSnapshotResponse({ tabId, status, details = [], fallbackUrl, fullPage = true, detailLevel = 'deep' }) {
  try {
    const snapshot = await captureSnapshotForTab(tabId, fullPage, detailLevel);
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

export function mergeResponseMeta(baseMeta, nextMeta) {
  const merged = { ...(baseMeta || {}) };

  if (nextMeta?.urls?.length) {
    merged.urls = Array.from(new Set([...(baseMeta?.urls || []), ...nextMeta.urls]));
  }

  if (Object.prototype.hasOwnProperty.call(nextMeta || {}, 'tabId')) {
    merged.tabId = nextMeta.tabId;
  }

  return Object.keys(merged).length ? merged : undefined;
}

export function combineResultWithSnapshot(baseResult, snapshotResult, tabId) {
  if (!snapshotResult?.ok) {
    console.warn('[snapshot] Snapshot failed, returning base result only:', snapshotResult?.error || 'unknown error');
    return baseResult;
  }

  const mergedContent = [...(baseResult.content || []), ...(snapshotResult.content || [])];
  const mergedMeta = mergeResponseMeta(baseResult._meta, snapshotResult._meta);
  const mergedData = { ...(baseResult.data || {}) };

  if (snapshotResult.snapshot) {
    mergedData.snapshot = snapshotResult.snapshot;
  }

  if (typeof tabId === 'number' && mergedData.tabId === undefined) {
    mergedData.tabId = tabId;
  }

  return {
    ...baseResult,
    content: mergedContent,
    _meta: mergedMeta,
    data: mergedData,
  };
}

export async function ensureTabForSnapshot(params = {}) {
  const { toolName = 'snapshot', preferredUrl, allowCreate = true } = params;
  const selection = await selectTab({ toolName, preferredUrl, allowCreate });
  if (!selection.ok) {
    return createErrorResult(`${toolName} tab selection failed`, selection.error);
  }
  return selection;
}

export { createErrorResult, formatSnapshotAsYAML };
