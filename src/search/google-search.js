// google-search.js
// Google search implementation with SERP scraping

import { waitForTabComplete, sendMessageWithRetry, delay, randomDelay } from '../lib/fetch-utils.js';
import {
  SEARCH_READINESS_TIMEOUT,
  TAB_LOAD_TIMEOUT,
  SEARCH_HUMANIZE_DELAY_MIN,
  SEARCH_HUMANIZE_DELAY_MAX,
  ContentScriptMessages
} from '../constants.js';

/**
 * Performs Google search and scrapes results
 *
 * @param {object} payload - Search parameters
 * @param {string} payload.query - Search query
 * @param {boolean} payload.closeTab - Whether to close the tab after scraping
 * @param {boolean} payload.debug - Whether to include debug info
 * @param {number} payload.readinessTimeoutMs - Timeout for waiting for SERP readiness
 * @param {number} payload.minResults - Minimum results to wait for
 * @param {number} payload.numResults - Number of results to return
 * @returns {Promise<{ok: boolean, data?: object, sourceTabId?: number, error?: string}>}
 */
export async function performGoogleSearchAndScrape(payload) {
  try {
    const {
      query,
      closeTab = true,
      debug = false,
      readinessTimeoutMs = SEARCH_READINESS_TIMEOUT,
      minResults,
      numResults
    } = payload || {};

    if (!query || !String(query).trim()) {
      return { ok: false, error: 'Missing query' };
    }

    const qstr = String(query).trim();
    const searchParams = new URLSearchParams({ q: qstr, oq: qstr, sourceid: 'chrome', ie: 'UTF-8' });

    // Add locale hints to better mirror real Chrome queries
    try {
      const uiLang = (chrome?.i18n?.getUILanguage?.() || (typeof navigator !== 'undefined' ? navigator.language : '') || 'en-US');
      const [lang, regionRaw] = String(uiLang).split('-');
      const gl = (regionRaw || lang || 'US').toUpperCase();
      searchParams.set('hl', uiLang);
      searchParams.set('gl', gl);
    } catch (_) {}

    // Common sclient seen in Chrome omnibox-driven searches
    searchParams.set('sclient', 'gws-wiz-serp');

    const url = `https://www.google.com/search?${searchParams.toString()}`;
    console.log('[Google Search] creating tab', { url });
    const created = await chrome.tabs.create({ url, active: false });
    const tabId = created.id;
    console.log('[Google Search] tab created', { tabId });

    // Wait for load complete
    await waitForTabComplete(tabId, TAB_LOAD_TIMEOUT);
    console.log('[Google Search] tab load complete', { tabId });

    // Small human-like jitter before interacting
    await delay(randomDelay(SEARCH_HUMANIZE_DELAY_MIN, SEARCH_HUMANIZE_DELAY_MAX));

    // Ask content script to confirm SERP readiness (hydration) before scraping
    let ready = null;
    try {
      const derivedMin = (typeof minResults === 'number' && !Number.isNaN(minResults))
        ? Math.max(1, Number(minResults))
        : Math.max(1, Math.min(Number(numResults || 4), 8));

      ready = await sendMessageWithRetry(
        tabId,
        {
          type: ContentScriptMessages.WAIT_FOR_SERP_READY,
          payload: { timeoutMs: readinessTimeoutMs, minResults: derivedMin, debug }
        },
        3,
        600
      );

      console.log('[Google Search] WAIT_FOR_SERP_READY', {
        ok: !!ready?.ok,
        ready: !!ready?.ready,
        reason: ready?.reason,
        counts: ready?.counts
      });
    } catch (e) {
      console.warn('[Google Search] readiness check failed; proceeding anyway', String(e?.message || e));
    }

    if (!ready?.ok || !ready?.ready) {
      // One more small settle if not ready
      await delay(800 + Math.floor(Math.random() * 600));
    }

    // Brief human-like interaction before scraping
    try {
      console.log('[Google Search] humanizing SERP interaction', { tabId });
      await sendMessageWithRetry(
        tabId,
        {
          type: 'HUMANIZE_SERP',
          payload: { steps: 1 + Math.floor(Math.random() * 3) }
        },
        2,
        400
      );
    } catch (_) {
      /* non-fatal */
    }

    await delay(120 + Math.floor(Math.random() * 280));

    console.log('[Google Search] sending SCRAPE_GOOGLE_SERP to content script', { tabId, debug, numResults });
    const data = await sendMessageWithRetry(
      tabId,
      {
        type: ContentScriptMessages.SCRAPE_GOOGLE_SERP,
        payload: { debug, numResults }
      },
      3,
      500
    );

    console.log('[Google Search] scrape response received', {
      ok: !!data,
      keys: data ? Object.keys(data) : []
    });

    if (closeTab) {
      try {
        console.log('[Google Search] closing tab', { tabId });
        await chrome.tabs.remove(tabId);
      } catch (_) {}
    }

    return { ok: true, data, sourceTabId: tabId };
  } catch (e) {
    console.warn('[Google Search] error', String(e?.message || e));
    return { ok: false, error: String(e?.message || e) };
  }
}
