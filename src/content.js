// content.js
// Minimal content script that supports the browser MCP workflows.

// -----------------------------------------------------------------------------
// Browser compatibility shim
// -----------------------------------------------------------------------------
try {
  if (typeof window !== 'undefined' && !window.browser && window.chrome) {
    window.browser = window.chrome;
  }
} catch (_) {}

try {
  if (typeof globalThis !== 'undefined' && !globalThis.browser && globalThis.chrome) {
    globalThis.browser = globalThis.chrome;
  }
} catch (_) {}

const MAX_PAGE_CONTENT = 100000;
const MAX_SELECTION_CONTENT = 25000;
const MAX_DEBUG_HTML = 120000;

function getMetaDescription() {
  const el = document.querySelector('meta[name="description"]');
  return el?.getAttribute('content') || '';
}

function getSelectionText() {
  const sel = window.getSelection();
  return sel && sel.toString ? sel.toString() : '';
}

function getVisibleText() {
  if (!document.body) return '';
  const text = document.body.innerText || '';
  return text.replace(/[\t\r]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function limit(value, max) {
  return String(value || '').slice(0, max);
}

function collectGoogleResults(numResults) {
  const results = [];
  const seen = new Set();
  const root = document.querySelector('#search') || document.querySelector('[role="main"]') || document.body;
  const headings = Array.from(root.querySelectorAll('h3')).filter((h) => (h.textContent || '').trim().length > 0);

  for (const h3 of headings) {
    let anchor = h3.closest('a[href]');
    if (!anchor) {
      const parent = h3.parentElement;
      if (parent?.querySelector('a[href]')?.contains(h3)) {
        anchor = parent.querySelector('a[href]');
      }
    }
    if (!anchor) continue;

    const href = anchor.href;
    if (!href || seen.has(href)) continue;

    const container = h3.closest('div.g, div.MjjYud, div[data-sokoban-container], div.yuRUbf, div[jscontroller]')
      || anchor.closest('div.g, div.MjjYud, div[data-sokoban-container], div[jscontroller]')
      || h3.parentElement?.parentElement
      || null;

    const snippetEl = container?.querySelector('.VwiC3b, .yXK7lf, .MUxGbd, .UroMUd, .lyLwlc, .kno-rdesc, [data-content-feature="1"]');
    const title = (h3.textContent || '').trim();
    if (!title) continue;

    results.push({
      title,
      url: href,
      snippet: (snippetEl?.innerText || '').trim(),
      snippetHtml: (snippetEl?.innerHTML || '').trim(),
      html: container ? container.outerHTML : '',
    });

    seen.add(href);
    if (results.length >= Math.max(numResults, 8)) break;
  }

  return results;
}

function collectDuckDuckGoResults(numResults) {
  const out = [];
  const seen = new Set();
  const root = document.querySelector('#links')
    || document.querySelector('[data-testid="mainline"]')
    || document.querySelector('main')
    || document.body;

  const pushFrom = (container) => {
    if (!container) return false;
    let anchor = container.querySelector('a[data-testid="result-title-a"], h2 a[href], h3 a[href], a[href]');
    if (!anchor && container.matches('a[href]')) {
      anchor = container;
    }
    if (!anchor || !anchor.href) return false;
    if (!/^https?:/i.test(anchor.href) || seen.has(anchor.href)) return false;

    const titleEl = container.querySelector('a[data-testid="result-title-a"], h2, h3');
    const snippetEl = container.querySelector('[data-testid="result-snippet"], .result__snippet, .result__body, .result__extras, p');
    const title = (titleEl?.textContent || anchor.textContent || '').trim();
    if (!title) return false;

    out.push({
      title,
      url: anchor.href,
      snippet: (snippetEl?.innerText || '').trim(),
      snippetHtml: (snippetEl?.innerHTML || '').trim(),
      html: container.outerHTML || '',
    });
    seen.add(anchor.href);
    return true;
  };

  const containers = Array.from(root.querySelectorAll('article[data-testid="result"], [data-testid="result"], .result, .web-result, li.result, .results_links_deep'));
  for (const container of containers) {
    pushFrom(container);
    if (out.length >= Math.max(numResults, 8)) break;
  }

  if (out.length < numResults) {
    const headings = Array.from(root.querySelectorAll('h2, h3')).filter((h) => (h.textContent || '').trim().length > 0);
    for (const heading of headings) {
      const container = heading.closest('article[data-testid="result"], [data-testid="result"], .result, .web-result, li.result, .results_links_deep');
      if (!pushFrom(container)) {
        const anchor = heading.closest('a[href]')
          || heading.querySelector('a[href]')
          || heading.parentElement?.querySelector('a[href]');
        if (anchor && anchor.href && /^https?:/i.test(anchor.href) && !seen.has(anchor.href)) {
          out.push({
            title: (heading.textContent || anchor.textContent || '').trim(),
            url: anchor.href,
            snippet: '',
            snippetHtml: '',
            html: heading.outerHTML || '',
          });
          seen.add(anchor.href);
        }
      }
      if (out.length >= Math.max(numResults, 8)) break;
    }
  }

  return out;
}

function collectGoogleAnswerBox() {
  const selectors = [
    '#kp-wp-tab-overview',
    'div[data-attrid="wa:/description"]',
    'div[data-attrid^="kc:/"]',
    'div[data-tts]',
    '#search .kp-blk',
    '#search [role="complementary"]',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el && (el.innerText || '').trim()) {
      return { text: el.innerText.trim(), html: el.outerHTML || '' };
    }
  }
  return { text: '', html: '' };
}

function collectDuckDuckGoAnswerBox() {
  const selector = '[data-testid="answer"], [data-testid="result--ads"] ~ [data-testid], .module__answers, .zci, .zci__body';
  const el = document.querySelector(selector);
  if (!el) return { text: '', html: '' };
  return { text: (el.innerText || '').trim(), html: el.outerHTML || '' };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message?.type) {
    case 'PING': {
      sendResponse({ ok: true, ready: true, url: location.href });
      return true;
    }

    case 'GET_PAGE_CONTENT': {
      if (window.top !== window) return false;
      const title = document.title || '';
      const selection = getSelectionText();
      const content = getVisibleText();
      sendResponse({
        ok: true,
        url: location.href,
        title: limit(title, 500),
        lang: document.documentElement?.lang || '',
        metaDescription: getMetaDescription(),
        content: limit(content, MAX_PAGE_CONTENT),
        selection: limit(selection, MAX_SELECTION_CONTENT),
      });
      return true;
    }

    case 'WAIT_FOR_SERP_READY': {
      (async () => {
        try {
          const timeoutMs = Math.max(1000, Number(message?.payload?.timeoutMs || 15000));
          const minResults = Math.max(1, Number(message?.payload?.minResults || 4));
          const start = Date.now();

          const poll = () => {
            const root = document.querySelector('#search') || document.querySelector('[role="main"]') || document.body;
            const headings = Array.from(root.querySelectorAll('h3')).filter((h) => (h.textContent || '').trim().length > 0);
            let good = 0;
            for (const h3 of headings) {
              const anchor = h3.closest('a[href]') || h3.parentElement?.querySelector('a[href]');
              if (anchor && anchor.href && /^https?:/i.test(anchor.href)) good++;
            }
            return good;
          };

          let count = poll();
          while (count < minResults && (Date.now() - start) < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 200 + Math.floor(Math.random() * 150)));
            count = poll();
          }

          sendResponse({
            ok: true,
            ready: count >= minResults,
            counts: { good: count, minResults, elapsedMs: Date.now() - start },
            reason: count >= minResults ? 'enough_results' : 'timeout',
          });
        } catch (error) {
          sendResponse({ ok: false, error: String(error?.message || error) });
        }
      })();
      return true;
    }

    case 'WAIT_FOR_DDG_READY': {
      (async () => {
        try {
          const timeoutMs = Math.max(1000, Number(message?.payload?.timeoutMs || 15000));
          const minResults = Math.max(1, Number(message?.payload?.minResults || 4));
          const start = Date.now();

          const poll = () => {
            const root = document.querySelector('#links')
              || document.querySelector('[data-testid="mainline"]')
              || document.querySelector('main')
              || document.body;
            const headings = Array.from(root.querySelectorAll('h2, h3')).filter((h) => (h.textContent || '').trim().length > 0);
            let good = 0;
            for (const heading of headings) {
              const anchor = heading.closest('a[href]')
                || heading.querySelector('a[href]')
                || heading.parentElement?.querySelector('a[href]');
              if (anchor && anchor.href && /^https?:/i.test(anchor.href)) good++;
            }
            return good;
          };

          let count = poll();
          while (count < minResults && (Date.now() - start) < timeoutMs) {
            await new Promise((resolve) => setTimeout(resolve, 200 + Math.floor(Math.random() * 150)));
            count = poll();
          }

          sendResponse({
            ok: true,
            ready: count >= minResults,
            counts: { good: count, minResults, elapsedMs: Date.now() - start },
            reason: count >= minResults ? 'enough_results' : 'timeout',
          });
        } catch (error) {
          sendResponse({ ok: false, error: String(error?.message || error) });
        }
      })();
      return true;
    }

    case 'HUMANIZE_SERP': {
      (async () => {
        try {
          const steps = Math.max(1, Math.min(5, Number(message?.payload?.steps || (1 + Math.floor(Math.random() * 3)))));
          for (let i = 0; i < steps; i++) {
            const direction = Math.random() < 0.8 ? 1 : -1;
            const distance = 150 + Math.floor(Math.random() * 450);
            try {
              window.scrollBy({ top: direction * distance, behavior: 'smooth' });
            } catch (_) {
              window.scrollBy(0, direction * distance);
            }
            const wait = 180 + Math.floor(Math.random() * 420);
            await new Promise((resolve) => setTimeout(resolve, wait));
          }
          sendResponse({ ok: true });
        } catch (error) {
          sendResponse({ ok: false, error: String(error?.message || error) });
        }
      })();
      return true;
    }

    case 'SCRAPE_GOOGLE_SERP': {
      try {
        const debug = !!(message?.payload?.debug ?? message?.debug);
        const numResults = Math.max(1, Math.min(Number(message?.payload?.numResults || 5), 10));
        const query = new URLSearchParams(location.search).get('q') || '';

        let results = collectGoogleResults(numResults);
        if (!results.length) {
          setTimeout(() => {
            try {
              const retryResults = collectGoogleResults(numResults).slice(0, numResults);
              const answerBox = collectGoogleAnswerBox();
              const payload = {
                ok: true,
                query,
                pageTitle: document.title || '',
                answerBox: answerBox.text,
                answerBoxHtml: answerBox.html,
                results: retryResults,
              };
              if (debug) {
                payload.debug = {
                  pageHtml: limit(document.documentElement?.outerHTML || '', MAX_DEBUG_HTML),
                  allLinks: Array.from(document.querySelectorAll('a[href]')).slice(0, 500).map((a) => ({
                    href: a.href,
                    text: (a.textContent || '').trim().slice(0, 200),
                  })),
                  fallbackOrganic: Array.from(document.querySelectorAll('#search a[href] h3')).map((h3) => {
                    const a = h3.closest('a[href]');
                    return a ? { title: (h3.textContent || '').trim(), url: a.href } : null;
                  }).filter(Boolean).slice(0, 10),
                };
              }
              sendResponse(payload);
            } catch (error) {
              sendResponse({ ok: false, error: String(error?.message || error) });
            }
          }, 600);
          return true;
        }

        results = results.slice(0, numResults);
        const answerBox = collectGoogleAnswerBox();
        const payload = {
          ok: true,
          query,
          pageTitle: document.title || '',
          answerBox: answerBox.text,
          answerBoxHtml: answerBox.html,
          results,
        };
        if (debug) {
          payload.debug = {
            pageHtml: limit(document.documentElement?.outerHTML || '', MAX_DEBUG_HTML),
            allLinks: Array.from(document.querySelectorAll('a[href]')).slice(0, 500).map((a) => ({
              href: a.href,
              text: (a.textContent || '').trim().slice(0, 200),
            })),
            fallbackOrganic: Array.from(document.querySelectorAll('#search a[href] h3')).map((h3) => {
              const a = h3.closest('a[href]');
              return a ? { title: (h3.textContent || '').trim(), url: a.href } : null;
            }).filter(Boolean).slice(0, 10),
          };
        }
        sendResponse(payload);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    case 'SCRAPE_DDG_SERP': {
      try {
        const debug = !!(message?.payload?.debug ?? message?.debug);
        const numResults = Math.max(1, Math.min(Number(message?.payload?.numResults || 5), 10));
        const query = new URLSearchParams(location.search).get('q') || '';

        let results = collectDuckDuckGoResults(numResults);
        if (!results.length) {
          setTimeout(() => {
            try {
              const retryResults = collectDuckDuckGoResults(numResults).slice(0, numResults);
              const answerBox = collectDuckDuckGoAnswerBox();
              const payload = {
                ok: true,
                query,
                pageTitle: document.title || '',
                answerBox: answerBox.text,
                answerBoxHtml: answerBox.html,
                results: retryResults,
              };
              if (debug) {
                payload.debug = {
                  htmlPreview: limit(document.documentElement?.outerHTML || '', MAX_DEBUG_HTML),
                  allLinks: Array.from(document.querySelectorAll('a[href]')).slice(0, 300).map((a) => ({
                    href: a.href,
                    text: (a.textContent || '').trim().slice(0, 200),
                  })),
                };
              }
              sendResponse(payload);
            } catch (error) {
              sendResponse({ ok: false, error: String(error?.message || error) });
            }
          }, 600);
          return true;
        }

        results = results.slice(0, numResults);
        const answerBox = collectDuckDuckGoAnswerBox();
        const payload = {
          ok: true,
          query,
          pageTitle: document.title || '',
          answerBox: answerBox.text,
          answerBoxHtml: answerBox.html,
          results,
        };
        if (debug) {
          payload.debug = {
            htmlPreview: limit(document.documentElement?.outerHTML || '', MAX_DEBUG_HTML),
            allLinks: Array.from(document.querySelectorAll('a[href]')).slice(0, 300).map((a) => ({
              href: a.href,
              text: (a.textContent || '').trim().slice(0, 200),
            })),
          };
        }
        sendResponse(payload);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    default:
      return false;
  }
});
