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
 * @param {object} searchFunctions - Object containing performDuckDuckGoSearchAndScrape and performGoogleSearchAndScrape
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
export async function handleSearch(params, searchFunctions) {
  const query = String(params?.query || '').trim();
  if (!query) {
    return createErrorResult('Search failed', 'Missing query');
  }

  const numResults = Math.max(1, Math.min(Number(params?.numResults || DEFAULT_SEARCH_RESULTS), MAX_SEARCH_RESULTS));
  const format = params?.format || 'serper';

  console.log('[MCP Tools] search', { query, numResults });

  try {
    // Try DuckDuckGo first
    console.log('[MCP Tools] invoking performDuckDuckGoSearchAndScrape', { query, numResults });
    const ddgRes = await searchFunctions.performDuckDuckGoSearchAndScrape({
      query,
      numResults,
      closeTab: true,
      debug: true
    });

    console.log('[MCP Tools] performDuckDuckGoSearchAndScrape done', {
      ok: ddgRes?.ok,
      hasData: !!ddgRes?.data
    });

    const dCount = (ddgRes?.ok && ddgRes?.data && Array.isArray(ddgRes.data.results))
      ? ddgRes.data.results.length
      : 0;

    if (ddgRes?.ok && ddgRes?.data && dCount > 0) {
      try {
        const d = ddgRes.data;
        const summarizeResult = (r) => ({
          title: r?.title,
          url: r?.url,
          snippetLen: r?.snippet ? r.snippet.length : 0,
        });

        console.log('[MCP Tools] DuckDuckGo scrape preview', {
          query: d.query,
          count: d.results?.length || 0,
          sample: d.results?.slice(0, 3).map(summarizeResult) || [],
        });
      } catch (e) {
        console.warn('[MCP Tools] Failed to log DDG preview:', e);
      }

      return buildSearchResponse({ query, data: ddgRes.data, format });
    }

    // Fallback to Google if DuckDuckGo fails
    console.log('[MCP Tools] DuckDuckGo failed or returned no results, falling back to Google');
    const googleRes = await searchFunctions.performGoogleSearchAndScrape({
      query,
      numResults,
      closeTab: true,
      debug: true
    });

    if (!googleRes?.ok || !googleRes?.data) {
      return createErrorResult('Search failed', 'Both DuckDuckGo and Google search failed');
    }

    return buildSearchResponse({ query, data: googleRes.data, format });
  } catch (e) {
    console.error('[MCP Tools] search error:', e);
    return createErrorResult('Search failed', e);
  }
}

function buildSearchResponse({ query, data, format }) {
  const urls = deriveUrls(data);

  if (format === 'text') {
    const text = formatSearchResultsAsText(query, data);
    return {
      ok: true,
      content: [
        {
          type: 'text',
          text,
        },
      ],
      _meta: urls.length ? { urls } : undefined,
      data,
    };
  }

  return {
    ok: true,
    content: [
      {
        type: 'text',
        text: JSON.stringify(data, null, 2),
      },
    ],
    _meta: urls.length ? { urls } : undefined,
    data,
  };
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
    }
  };

  collect(data?.results);
  collect(data?.organic);

  return Array.from(urls);
}

function formatSearchResultsAsText(query, data) {
  let text = `Search results for: ${query}\n\n`;

  if (data?.knowledgeGraph) {
    const kg = data.knowledgeGraph;
    text += `Knowledge Graph: ${kg.title || ''}\n${kg.description || ''}\n\n`;
  }

  const results = Array.isArray(data?.results) ? data.results : Array.isArray(data?.organic) ? data.organic : [];
  if (results.length > 0) {
    text += 'Results:\n';
    for (const item of results) {
      text += `\n${item.position || ''} ${item.title || ''}\n`;
      if (item.url) text += `   ${item.url}\n`;
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
