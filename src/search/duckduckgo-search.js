// duckduckgo-search.js
// DuckDuckGo search implementation with HTML parsing

import { DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS, MAX_HTML_PREVIEW } from '../constants.js';

/**
 * Normalizes DuckDuckGo redirect URLs (uddg parameter)
 * @param {string} href - URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeDdgUrl(href) {
  try {
    if (!href) return href;
    const u = new URL(href, 'https://duckduckgo.com');
    // If it's a DDG redirect (/l/ or /r/) with uddg param, decode it
    const uddg = u.searchParams.get('uddg');
    if ((u.hostname.endsWith('duckduckgo.com') || u.hostname === 'duckduckgo.com') &&
        (u.pathname === '/l/' || u.pathname === '/r/' || uddg)) {
      if (uddg) {
        const decoded = decodeURIComponent(uddg);
        if (/^https?:/i.test(decoded)) return decoded;
      }
    }
    return u.href;
  } catch (_) {
    return href;
  }
}

/**
 * Parses DuckDuckGo HTML using DOMParser
 * @param {string} htmlText - HTML content
 * @param {number} numResults - Number of results to return
 * @returns {Array} Parsed results
 */
function parseWithDom(htmlText, numResults) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlText, 'text/html');
    const out = [];
    const seen = new Set();

    // Primary: classic DDG HTML markup
    const containers = Array.from(doc.querySelectorAll('div.result, .results_links_deep, .web-result, li.result'));

    const pushContainer = (container) => {
      if (!container) return false;
      const a = container.querySelector('a.result__a, h2 a[href], h3 a[href], a[href]');
      if (!a || !a.href) return false;
      const finalHref = normalizeDdgUrl(a.href);
      if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) return false;
      const titleEl = container.querySelector('a.result__a, h2, h3');
      const snippetEl = container.querySelector('.result__snippet, .result__body, p');
      const title = (titleEl?.textContent || a.textContent || '').trim();
      if (!title) return false;
      const snippet = (snippetEl?.textContent || '').trim();
      const snippetHtml = (snippetEl?.innerHTML || '').trim();
      const htmlFrag = container.outerHTML || '';
      out.push({ title, url: finalHref, snippet, snippetHtml, html: htmlFrag });
      seen.add(finalHref);
      return true;
    };

    for (const c of containers) {
      pushContainer(c);
      if (out.length >= Math.max(8, Number(numResults || DEFAULT_SEARCH_RESULTS))) break;
    }

    // Fallback: deep heading scan
    if (out.length < (numResults || DEFAULT_SEARCH_RESULTS)) {
      const heads = Array.from(doc.querySelectorAll('#links a[href] h2, #links a[href] h3, main a[href] h2, main a[href] h3, h2 a[href], h3 a[href]'));
      for (const h of heads) {
        const a = h.closest('a[href]');
        if (!a || !a.href) continue;
        const finalHref = normalizeDdgUrl(a.href);
        if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) continue;
        const title = (h.textContent || a.textContent || '').trim();
        if (!title) continue;
        out.push({ title, url: finalHref, snippet: '', snippetHtml: '', html: h.outerHTML || '' });
        seen.add(finalHref);
        if (out.length >= Math.max(8, Number(numResults || DEFAULT_SEARCH_RESULTS))) break;
      }
    }

    // Fallback 2: newer layout title anchors
    if (out.length < (numResults || DEFAULT_SEARCH_RESULTS)) {
      const titleAnchors = Array.from(doc.querySelectorAll('a[data-testid="result-title-a"], #links a.result__a, .result__title a'));
      for (const a of titleAnchors) {
        if (!a || !a.href) continue;
        const finalHref = normalizeDdgUrl(a.href);
        if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) continue;
        const title = (a.textContent || '').trim();
        if (!title) continue;
        out.push({ title, url: finalHref, snippet: '', snippetHtml: '', html: a.outerHTML || '' });
        seen.add(finalHref);
        if (out.length >= Math.max(8, Number(numResults || DEFAULT_SEARCH_RESULTS))) break;
      }
    }

    // Fallback 3: broad anchors with heading descendants or strong text
    if (out.length < (numResults || DEFAULT_SEARCH_RESULTS)) {
      const anchors = Array.from(doc.querySelectorAll('#links a[href], main a[href]'));
      for (const a of anchors) {
        const finalHref = normalizeDdgUrl(a.href);
        if (!/^https?:/i.test(finalHref) || seen.has(finalHref)) continue;
        const h = a.querySelector('h2, h3, strong');
        const title = (h?.textContent || a.textContent || '').trim();
        if (!title) continue;
        out.push({ title, url: finalHref, snippet: '', snippetHtml: '', html: a.outerHTML || '' });
        seen.add(finalHref);
        if (out.length >= Math.max(8, Number(numResults || DEFAULT_SEARCH_RESULTS))) break;
      }
    }

    return out;
  } catch (_) {
    return null;
  }
}

/**
 * Parses DuckDuckGo HTML using regex fallback
 * @param {string} html - HTML content
 * @param {number} numResults - Number of results to return
 * @returns {Array} Parsed results
 */
function parseWithRegex(html, numResults) {
  try {
    const rx = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="((?:https?:)?\/\/[^"#]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const tmp = [];
    const seen = new Set();
    let m;

    const decode = (s) => {
      try {
        return String(s)
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&#x27;/g, "'");
      } catch (_) {
        return s;
      }
    };

    while ((m = rx.exec(html)) && tmp.length < Math.max(8, Number(numResults || DEFAULT_SEARCH_RESULTS))) {
      const href = normalizeDdgUrl(m[1]);
      if (seen.has(href)) continue;
      const title = decode(m[2].replace(/<[^>]+>/g, '')).trim();
      if (!title) continue;

      // Look ahead locally for a nearby snippet element within the same result block
      const start = Math.max(0, m.index);
      const segment = html.slice(start, start + 2000);
      let snippetHtml = '';
      let snippet = '';
      const snipMatchA = segment.match(/<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const snipMatchDiv = !snipMatchA && segment.match(/<div[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      const snipInner = (snipMatchA && snipMatchA[1]) || (snipMatchDiv && snipMatchDiv[1]) || '';
      if (snipInner) {
        snippetHtml = snipInner.trim();
        snippet = decode(snipInner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
      }

      tmp.push({ title, url: href, snippet, snippetHtml, html: m[0] });
      seen.add(href);
    }

    return tmp;
  } catch (_) {
    return [];
  }
}

/**
 * Performs DuckDuckGo search and scrapes results
 *
 * @param {object} payload - Search parameters
 * @param {string} payload.query - Search query
 * @param {boolean} payload.debug - Whether to include debug info
 * @param {number} payload.numResults - Number of results to return
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function performDuckDuckGoSearchAndScrape(payload) {
  try {
    const { query, debug = false, numResults } = payload || {};

    if (!query || !String(query).trim()) {
      return { ok: false, error: 'Missing query' };
    }

    const qstr = String(query).trim();

    // Prefer the HTML-only endpoint to avoid JS/hydration and simplify parsing
    const baseUrls = [
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(qstr)}&ia=web`,
      `https://duckduckgo.com/html/?q=${encodeURIComponent(qstr)}&ia=web`
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    let html = '';
    let respOk = false;
    let lastErr = '';

    for (const url of baseUrls) {
      try {
        const resp = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'text/html,application/xhtml+xml',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
          },
          signal: controller.signal
        });

        if (resp.ok) {
          html = await resp.text();
          respOk = true;
          break;
        } else {
          lastErr = `HTTP ${resp.status}`;
        }
      } catch (e) {
        lastErr = String(e?.message || e);
      }
    }

    clearTimeout(timeout);

    if (!respOk || !html) {
      return { ok: false, error: lastErr || 'DDG fetch failed' };
    }

    // Try DOM parsing first
    let results = parseWithDom(html, numResults) || [];

    // Fallback to regex parsing if DOM parsing fails
    if (!results.length) {
      results = parseWithRegex(html, numResults);
    }

    // Limit results
    results = Array.isArray(results)
      ? results.slice(0, Math.max(1, Math.min(Number(numResults || DEFAULT_SEARCH_RESULTS), MAX_SEARCH_RESULTS)))
      : [];

    const data = {
      ok: true,
      query: qstr,
      pageTitle: 'DuckDuckGo Search',
      answerBox: '',
      answerBoxHtml: '',
      results
    };

    if (debug) {
      const allLinks = [];
      data.debug = { htmlPreview: html.slice(0, MAX_HTML_PREVIEW), allLinks };
    }

    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}
