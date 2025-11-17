// search.js
// MCP Bridge search tool (delegates to actual search implementations)

import { DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS } from '../constants.js';
import { createErrorResult } from './snapshot-utils.js';

/**
 * Performs web search (delegates to search modules)
 * This is a placeholder that will call the actual search implementation
 * when Phase 5 (extract search modules) is complete.
 *
 * @param {object} params - Search parameters
 * @param {object} searchFunctions - Object containing performGoogleSearchAndScrape
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function handleSearch(params, searchFunctions) {
  const query = String(params?.query || '').trim();
  if (!query) {
    return createErrorResult('Search failed', 'Missing query');
  }

  const numResults = Math.max(1, Math.min(Number(params?.numResults || DEFAULT_SEARCH_RESULTS), MAX_SEARCH_RESULTS));
  const format = params?.format || 'serper';
  const startedAt = Date.now();

  console.log('[MCP Tools] search', { query, numResults });

  try {
    const { performGoogleSearchAndScrape } = searchFunctions || {};
    if (typeof performGoogleSearchAndScrape !== 'function') {
      return createErrorResult('Search failed', 'Google search is unavailable');
    }

    console.log('[MCP Tools] invoking performGoogleSearchAndScrape', { query, numResults });
    const googleRes = await performGoogleSearchAndScrape({
      query,
      numResults,
      closeTab: true,
      debug: true
    });

    if (!googleRes?.ok || !googleRes?.data) {
      return createErrorResult('Search failed', googleRes?.error || 'Google search failed');
    }

    const elapsedMs = Date.now() - startedAt;
    return buildSearchResponse({ query, data: googleRes.data, format, numResults, elapsedMs });
  } catch (e) {
    console.error('[MCP Tools] search error:', e);
    return createErrorResult('Search failed', e);
  }
}

function buildSearchResponse({ query, data, format, numResults, elapsedMs }) {
  const normalized = normalizeToSerperLike({ query, data, numResults, elapsedMs });
  const urls = deriveUrls(normalized);

  if (format === 'text') {
    const text = formatSearchResultsAsText(query, normalized);
    return {
      ok: true,
      content: [
        {
          type: 'text',
          text,
        },
      ],
      _meta: urls.length ? { urls } : undefined,
      data: normalized,
    };
  }

  return {
    ok: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(normalized, null, 2),
      },
    ],
    _meta: urls.length ? { urls } : undefined,
    data: normalized,
  };
}

function normalizeToSerperLike({ query, data, numResults, elapsedMs }) {
  const clean = (text) => {
    if (!text) return '';
    return String(text)
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const deriveLocale = () => {
    try {
      const uiLang = (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US';
      const [lang, regionRaw] = String(uiLang).split('-');
      const hl = uiLang || 'en-US';
      const gl = (regionRaw || lang || 'US').toUpperCase();
      return { hl, gl };
    } catch (_) {
      return { hl: 'en', gl: 'US' };
    }
  };

  const organicSource = Array.isArray(data?.results)
    ? data.results
    : Array.isArray(data?.organic)
      ? data.organic
      : [];

  const organic = organicSource
    .map((item, idx) => {
      const url = item?.url || item?.link;
      const title = clean(item?.title);
      if (!url || !title) return null;

      let displayedLink = '';
      try {
        const u = new URL(url);
        displayedLink = u.host;
      } catch (_) {}

      return {
        position: idx + 1,
        title,
        link: url,
        displayedLink,
        snippet: clean(item?.snippet || item?.snippetHtml),
        favicon: item?.favicon,
        sitelinks: Array.isArray(item?.sitelinks) ? item.sitelinks : undefined,
      };
    })
    .filter(Boolean)
    .slice(0, numResults || DEFAULT_SEARCH_RESULTS);

  const answerBox = (() => {
    if (data?.answerBox && typeof data.answerBox === 'object') {
      return {
        snippet: clean(data.answerBox.text || data.answerBox.snippet || data.answerBox.answer),
        snippetHighlighted: Array.isArray(data.answerBox.snippetHighlighted)
          ? data.answerBox.snippetHighlighted.map((t) => clean(t)).filter(Boolean)
          : [],
      };
    }

    const snippet = clean(data?.answerBox || data?.answerBoxHtml);
    return snippet ? { snippet, snippetHighlighted: [] } : null;
  })();

  const { hl, gl } = deriveLocale();

  const normalized = {
    searchParameters: {
      q: query,
      type: 'search',
      hl,
      gl,
      num: numResults || organic.length || DEFAULT_SEARCH_RESULTS,
      page: 1,
      autocorrect: true,
    },
    searchInformation: {
      searchTime: typeof elapsedMs === 'number' ? elapsedMs / 1000 : undefined,
      formattedSearchTime: typeof elapsedMs === 'number' ? (elapsedMs / 1000).toFixed(2) : undefined,
      totalResults: String(Math.max(organic.length, 0)),
      formattedTotalResults: Math.max(organic.length, 0).toLocaleString('en-US'),
    },
    organic,
    relatedSearches: Array.isArray(data?.relatedSearches) ? data.relatedSearches : [],
    topStories: Array.isArray(data?.topStories) ? data.topStories : [],
  };

  if (answerBox?.snippet) {
    normalized.answerBox = {
      type: 'answer',
      snippet: answerBox.snippet,
      snippetHighlighted: answerBox.snippetHighlighted || [],
    };
  }

  if (data?.knowledgeGraph) {
    normalized.knowledgeGraph = data.knowledgeGraph;
  }

  if (Array.isArray(data?.peopleAlsoAsk) && data.peopleAlsoAsk.length) {
    normalized.peopleAlsoAsk = data.peopleAlsoAsk.map((p, idx) => ({
      position: idx + 1,
      question: clean(p.question || p.title),
      snippet: clean(p.snippet),
      title: clean(p.title),
      link: p.link,
    }));
  } else {
    normalized.peopleAlsoAsk = [];
  }

  normalized.urls = deriveUrls(normalized);
  return normalized;
}

function deriveUrls(data) {
  const urls = new Set();
  if (Array.isArray(data?.urls)) {
    for (const url of data.urls) {
      if (url) urls.add(url);
    }
  }

  const collect = (items) => {
    if (!Array.isArray(items)) return;
    for (const item of items) {
      if (item?.url) urls.add(item.url);
      if (item?.link) urls.add(item.link);
    }
  };

  collect(data?.results);
  collect(data?.organic);
  collect(data?.topStories);
  collect(data?.peopleAlsoAsk);

  if (data?.knowledgeGraph?.website) {
    urls.add(data.knowledgeGraph.website);
  }

  return Array.from(urls);
}

function formatSearchResultsAsText(query, data) {
  let text = `Search results for: ${query}\n\n`;

  if (data?.knowledgeGraph) {
    const kg = data.knowledgeGraph;
    text += `Knowledge Graph: ${kg.title || ''}\n${kg.description || ''}\n\n`;
  }

  const results = Array.isArray(data?.organic) ? data.organic : Array.isArray(data?.results) ? data.results : [];
  if (results.length > 0) {
    text += 'Results:\n';
    for (const item of results) {
      text += `\n${item.position || ''} ${item.title || ''}\n`;
      if (item.link || item.url) text += `   ${item.link || item.url}\n`;
      if (item.snippet) text += `   ${item.snippet}\n`;
    }
  } else {
    text += 'No results returned.\n';
  }

  if (Array.isArray(data?.peopleAlsoAsk) && data.peopleAlsoAsk.length > 0) {
    text += '\nPeople Also Ask:\n';
    for (const paa of data.peopleAlsoAsk) {
      text += `\nQ: ${paa.question}\n`;
      text += `A: ${paa.snippet || ''}\n`;
    }
  }

  return text.trimEnd();
}
