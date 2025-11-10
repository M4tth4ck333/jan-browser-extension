// observation.js
// MCP Bridge observation tools: screenshot, snapshot

import { selectTab, validateWindow } from '../lib/tab-manager.js';
import { captureWithTimeout } from '../lib/fetch-utils.js';
import { SCREENSHOT_CAPTURE_TIMEOUT } from '../constants.js';

/**
 * Captures a screenshot of the visible tab
 */
export async function handleScreenshot(params) {
  console.log('[MCP Tools] screenshot called');

  try {
    const selection = await selectTab({ requireUrl: true, toolName: 'screenshot' });
    if (!selection.ok) return selection;

    const { tabId, tab } = selection;

    console.log('[MCP Tools] screenshot - using tab:', tabId, 'window:', tab.windowId);

    // Validate window state
    const windowValidation = await validateWindow(tab.windowId);
    if (!windowValidation.ok) return windowValidation;

    const { windowInfo } = windowValidation;
    console.log('[MCP Tools] screenshot - window state:', windowInfo.state, 'focused:', windowInfo.focused);

    // Capture screenshot with timeout
    console.log('[MCP Tools] screenshot - capturing from window:', tab.windowId);
    const dataUrl = await captureWithTimeout(
      tab.windowId,
      { format: 'png' },
      SCREENSHOT_CAPTURE_TIMEOUT
    );

    console.log('[MCP Tools] screenshot taken', {
      url: tab.url,
      tabId: tabId,
      dataUrlLength: dataUrl?.length || 0
    });

    if (!dataUrl || dataUrl.length === 0) {
      return {
        ok: false,
        error: 'Screenshot capture returned empty data'
      };
    }

    return {
      ok: true,
      data: {
        url: tab.url,
        screenshot: dataUrl,
        timestamp: new Date().toISOString(),
        tabId
      }
    };
  } catch (e) {
    console.error('[MCP Tools] screenshot error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

/**
 * Captures an ARIA accessibility tree snapshot of the page
 */
export async function handleSnapshot(params) {
  try {
    const selection = await selectTab({ toolName: 'snapshot' });
    if (!selection.ok) return selection;

    const { tabId } = selection;

    // Get viewport-visible DOM snapshot with ARIA accessibility tree
    const [{ result: snapshot }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        // Helper to check if element is visible in viewport
        function isInViewport(element) {
          const rect = element.getBoundingClientRect();
          return (
            rect.top < window.innerHeight &&
            rect.bottom > 0 &&
            rect.left < window.innerWidth &&
            rect.right > 0 &&
            rect.width > 0 &&
            rect.height > 0
          );
        }

        // Helper to build ARIA tree recursively (only visible elements)
        function buildAriaTree(element, depth = 0, maxDepth = 8) {
          if (depth > maxDepth) return null;
          if (!isInViewport(element)) return null; // Only include viewport-visible elements

          const role = element.getAttribute('role') ||
                      (element.tagName === 'A' ? 'link' :
                       element.tagName === 'BUTTON' ? 'button' :
                       element.tagName === 'INPUT' ? 'textbox' :
                       element.tagName === 'IMG' ? 'img' :
                       element.tagName === 'NAV' ? 'navigation' :
                       element.tagName === 'MAIN' ? 'main' :
                       element.tagName === 'HEADER' ? 'banner' :
                       element.tagName === 'FOOTER' ? 'contentinfo' :
                       element.tagName.match(/^H[1-6]$/) ? 'heading' : null);

          if (!role) return null;

          const ariaLabel = element.getAttribute('aria-label') ||
                           element.getAttribute('aria-labelledby') ||
                           element.getAttribute('title') ||
                           (element.tagName === 'A' || element.tagName === 'BUTTON'
                             ? element.textContent?.trim().slice(0, 100)
                             : null);

          const node = {
            role,
            name: ariaLabel || element.textContent?.trim().slice(0, 50) || '',
            tag: element.tagName.toLowerCase()
          };

          // Add ARIA attributes
          if (element.getAttribute('aria-expanded')) node.expanded = element.getAttribute('aria-expanded') === 'true';
          if (element.getAttribute('aria-selected')) node.selected = element.getAttribute('aria-selected') === 'true';
          if (element.getAttribute('aria-checked')) node.checked = element.getAttribute('aria-checked') === 'true';
          if (element.getAttribute('aria-disabled')) node.disabled = element.getAttribute('aria-disabled') === 'true';
          if (element.getAttribute('aria-level')) node.level = parseInt(element.getAttribute('aria-level'));

          // Add element-specific attributes
          if (element.href) node.href = element.href;
          if (element.id) node.id = element.id;
          if (element.className && element.className.trim()) node.className = element.className.trim().split(/\s+/).slice(0, 3).join(' ');

          // Build children (only visible ones)
          const children = [];
          for (const child of element.children) {
            const childNode = buildAriaTree(child, depth + 1, maxDepth);
            if (childNode) children.push(childNode);
          }
          if (children.length > 0) node.children = children.slice(0, 15); // Limit children

          return node;
        }

        // Get page metadata
        const title = document.title;
        const description = document.querySelector('meta[name="description"]')?.content || '';
        const canonical = document.querySelector('link[rel="canonical"]')?.href || '';

        // Build ARIA accessibility tree
        const ariaTree = buildAriaTree(document.body);

        // Get only VISIBLE interactive elements with ARIA info
        const interactiveElements = [];
        const selectors = 'a[href], button, input, select, textarea, [role="button"], [role="link"], [tabindex]';
        Array.from(document.querySelectorAll(selectors)).filter(isInViewport).slice(0, 50).forEach((el, idx) => {
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          const label = el.getAttribute('aria-label') ||
                       el.getAttribute('placeholder') ||
                       el.textContent?.trim().slice(0, 50) || '';

          interactiveElements.push({
            index: idx,
            role,
            tag: el.tagName.toLowerCase(),
            label,
            id: el.id || undefined,
            name: el.name || undefined,
            type: el.type || undefined,
            href: el.href || undefined,
            disabled: el.disabled || undefined,
            ariaExpanded: el.getAttribute('aria-expanded') || undefined,
            ariaSelected: el.getAttribute('aria-selected') || undefined
          });
        });

        // Get only VISIBLE links
        const links = Array.from(document.querySelectorAll('a[href]')).filter(isInViewport).slice(0, 30).map(a => ({
          text: a.textContent?.trim().slice(0, 100) || '',
          href: a.href,
          rel: a.rel || undefined,
          ariaLabel: a.getAttribute('aria-label') || undefined
        }));

        // Get only VISIBLE images
        const images = Array.from(document.querySelectorAll('img[src]')).filter(isInViewport).slice(0, 20).map(img => ({
          src: img.src,
          alt: img.alt || '',
          ariaLabel: img.getAttribute('aria-label') || undefined
        }));

        // Get only VISIBLE form fields
        const visibleForms = Array.from(document.querySelectorAll('form')).filter(isInViewport).slice(0, 5);
        const forms = visibleForms.map(form => ({
          action: form.action,
          method: form.method,
          ariaLabel: form.getAttribute('aria-label') || undefined,
          fields: Array.from(form.querySelectorAll('input, select, textarea')).filter(isInViewport).slice(0, 15).map(field => ({
            type: field.type || field.tagName.toLowerCase(),
            name: field.name,
            id: field.id,
            placeholder: field.placeholder || undefined,
            ariaLabel: field.getAttribute('aria-label') || undefined,
            required: field.required || undefined
          }))
        }));

        // Get only VISIBLE headings
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter(isInViewport).slice(0, 20).map(h => ({
          level: h.tagName,
          text: h.textContent?.trim().slice(0, 100) || '',
          ariaLevel: h.getAttribute('aria-level') || undefined
        }));

        // Get only VISIBLE landmarks
        const landmarks = [];
        const landmarkSelectors = 'main, nav, header, footer, aside, [role="main"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"]';
        Array.from(document.querySelectorAll(landmarkSelectors)).filter(isInViewport).slice(0, 10).forEach(el => {
          const role = el.getAttribute('role') || el.tagName.toLowerCase();
          landmarks.push({
            role,
            tag: el.tagName.toLowerCase(),
            ariaLabel: el.getAttribute('aria-label') || undefined,
            id: el.id || undefined
          });
        });

        return {
          url: window.location.href,
          title,
          description,
          canonical,
          // NO html field - too large!
          aria: {
            tree: ariaTree,
            interactive: interactiveElements,
            landmarks
          },
          links,
          images,
          forms,
          headings,
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
          },
          timestamp: new Date().toISOString()
        };
      }
    });

    console.log('[MCP Tools] snapshot captured', {
      url: snapshot.url,
      linkCount: snapshot.links?.length || 0,
      imageCount: snapshot.images?.length || 0,
      tabId: tabId
    });

    return { ok: true, data: { ...snapshot, tabId } };
  } catch (e) {
    console.error('[MCP Tools] snapshot error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}
