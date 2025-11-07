// search.js
// MCP Bridge search tool (delegates to actual search implementations)

import { DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS } from '../constants.js';

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
    return { ok: false, error: 'Missing query' };
  }

  const numResults = Math.max(1, Math.min(Number(params?.numResults || DEFAULT_SEARCH_RESULTS), MAX_SEARCH_RESULTS));

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
          snippetLen: r?.snippet ? r.snippet.length : 0
        });

        console.log('[MCP Tools] DuckDuckGo scrape preview', {
          query: d.query,
          count: d.results?.length || 0,
          sample: d.results?.slice(0, 3).map(summarizeResult) || []
        });
      } catch (e) {
        console.warn('[MCP Tools] Failed to log DDG preview:', e);
      }

      return { ok: true, data: ddgRes.data };
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
      return {
        ok: false,
        error: 'Both DuckDuckGo and Google search failed'
      };
    }

    return { ok: true, data: googleRes.data };
  } catch (e) {
    console.error('[MCP Tools] search error:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}
