// content.js
// Minimal content script that supports the browser MCP workflows.

// Note: reference-overlay.js is loaded before this file in manifest.json
// Functions showReferenceOverlay, hideReferenceOverlay, toggleReferenceOverlay, getOverlayStatus
// are available globally from that script

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

function collectGoogleRelatedSearches() {
  const out = [];
  const seen = new Set();
  const containers = [
    document.querySelector('#bres'),
    document.querySelector('div[data-async-context*="query:related"]'),
    document.querySelector('[aria-label="Related searches"], [data-hveid][aria-label*="Related"]')
  ].filter(Boolean);

  for (const container of containers) {
    const anchors = Array.from(container.querySelectorAll('a[href]'));
    for (const a of anchors) {
      const query = (a.textContent || '').trim();
      if (!query || seen.has(query)) continue;
      out.push({ query });
      seen.add(query);
    }
  }

  return out;
}

function collectGoogleTopStories() {
  const out = [];
  const seen = new Set();

  const containers = Array.from(
    document.querySelectorAll(
      [
        'div[aria-label="Top stories"]',
        'g-scrolling-carousel[aria-label*="Top stories"]',
        'div[jscontroller="U16t3c"]',
        'div[data-ved][data-hveid] g-card',
        'div.VkpGBb',
        '#search .SoAPf',
        '#search .WlydOe',
        '#search .JJZKK',
        '#search .dbsr'
      ].join(',')
    )
  ).filter(Boolean);

  const extractStoryFromCard = (card) => {
    const anchor = Array.from(card.querySelectorAll('a[href]')).find((a) => /^https?:/i.test(a.href));
    if (!anchor || seen.has(anchor.href)) return null;

    const titleEl =
      card.querySelector('div[role="heading"], .mCBkyc, .JheGif, .nDgy9d, .BNeawe.vvjwJb, h3, h4') ||
      anchor.querySelector('div[role="heading"], .mCBkyc, .JheGif, .nDgy9d, .BNeawe.vvjwJb, h3, h4');
    const sourceEl =
      card.querySelector('.CEMjEf, .UpZIS, cite, .vr1PYe, .XTjFC.WF4CUc, .NUnG9d') ||
      anchor.querySelector('.CEMjEf, .UpZIS, cite, .vr1PYe, .XTjFC.WF4CUc, .NUnG9d');
    const dateEl = card.querySelector('time, .LfVVr, .WG9SHc span, .OSrXXb, .ZE0LJd');
    const snippetEl =
      card.querySelector('.GI74Re, .y3IQfc, .pcJO7e, .JheGif, .BNeawe.s3v9rd, .JheGif') ||
      anchor.querySelector('.GI74Re, .y3IQfc, .pcJO7e, .JheGif, .BNeawe.s3v9rd, .JheGif');

    const title = (titleEl?.textContent || anchor.textContent || '').trim();
    if (!title) return null;

    seen.add(anchor.href);
    return {
      title,
      link: anchor.href,
      source: (sourceEl?.textContent || '').trim(),
      date: (dateEl?.getAttribute?.('datetime') || dateEl?.textContent || '').trim(),
      snippet: (snippetEl?.textContent || '').trim(),
    };
  };

  for (const container of containers) {
    const cards = Array.from(container.querySelectorAll('g-card, article, .SoAPf, .WlydOe, .JJZKK, .dbsr, .xSqewd, .F9rcV')).filter(Boolean);
    for (const card of cards) {
      const story = extractStoryFromCard(card);
      if (story) out.push(story);
    }
  }

  // Fallback: scan any news-style cards under #search if nothing was found yet
  if (!out.length) {
    const fallbackCards = Array.from(document.querySelectorAll('#search .dbsr, #search .SoAPf, #search .WlydOe'));
    for (const card of fallbackCards) {
      const story = extractStoryFromCard(card);
      if (story) out.push(story);
    }
  }

  return out.slice(0, 10);
}

function collectGooglePeopleAlsoAsk() {
  const out = [];
  const seen = new Set();
  const containers = Array.from(document.querySelectorAll('[jscontroller="Q7Rsec"], [jsname="Cpkphb"], .related-question-pair'));

  for (const container of containers) {
    const questionEl = container.querySelector('div[role="heading"], .ptHjxf, .mv7LYc, .yuRUbf, h2, h3, span');
    const anchor = container.querySelector('a[href]');
    const snippetEl = container.querySelector('.hgKElc, .kno-rdesc, .LGOjhe, [data-tts], .yXK7lf, .w6p8Qb');

    const question = (questionEl?.textContent || '').trim();
    if (!question || seen.has(question)) continue;

    out.push({
      question,
      title: (anchor?.textContent || question).trim(),
      link: anchor?.href || '',
      snippet: (snippetEl?.textContent || '').trim(),
    });

    seen.add(question);
  }

  return out;
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
      const highlights = Array.from(el.querySelectorAll('em, b, strong')).map((n) => (n.textContent || '').trim()).filter(Boolean);
      return { text: el.innerText.trim(), html: el.outerHTML || '', snippetHighlighted: highlights };
    }
  }
  return { text: '', html: '', snippetHighlighted: [] };
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
              const relatedSearches = collectGoogleRelatedSearches();
              const topStories = collectGoogleTopStories();
              const peopleAlsoAsk = collectGooglePeopleAlsoAsk();
              const payload = {
                ok: true,
                query,
                pageTitle: document.title || '',
                answerBox,
                answerBoxHtml: answerBox.html,
                relatedSearches,
                topStories,
                peopleAlsoAsk,
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
        const relatedSearches = collectGoogleRelatedSearches();
        const topStories = collectGoogleTopStories();
        const peopleAlsoAsk = collectGooglePeopleAlsoAsk();
        const payload = {
          ok: true,
          query,
          pageTitle: document.title || '',
          answerBox,
          answerBoxHtml: answerBox.html,
          relatedSearches,
          topStories,
          peopleAlsoAsk,
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

    case 'SHOW_REFERENCE_OVERLAY': {
      try {
        const refMap = message?.payload?.refMap;
        if (!refMap) {
          sendResponse({ ok: false, error: 'Missing refMap in payload' });
          return true;
        }
        const result = showReferenceOverlay(refMap);
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    case 'HIDE_REFERENCE_OVERLAY': {
      try {
        const result = hideReferenceOverlay();
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    case 'TOGGLE_REFERENCE_OVERLAY': {
      try {
        const result = toggleReferenceOverlay();
        sendResponse(result);
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    case 'GET_OVERLAY_STATUS': {
      try {
        const result = getOverlayStatus();
        sendResponse({ ok: true, status: result });
      } catch (error) {
        sendResponse({ ok: false, error: String(error?.message || error) });
      }
      return true;
    }

    default:
      return false;
  }
});
