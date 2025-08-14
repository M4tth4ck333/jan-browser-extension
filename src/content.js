// content.js
// Extracts text content from the page and returns it on request

function getMetaDescription() {
  const el = document.querySelector('meta[name="description"]');
  return el?.getAttribute('content') || '';
}

function getSelectionText() {
  const sel = window.getSelection();
  return sel && sel.toString ? sel.toString() : '';
}

function getVisibleText() {
  // Simple baseline: innerText approximates visible text.
  // Could be improved with Readability.js if desired.
  const t = document.body ? document.body.innerText || '' : '';
  return t.replace(/[\t\r]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'GET_PAGE_CONTENT') {
    const maxChars = 100000; // safety cap
    const content = getVisibleText().slice(0, maxChars);
    const selection = getSelectionText().slice(0, maxChars / 4);

    sendResponse({
      ok: true,
      url: location.href,
      title: document.title || '',
      lang: document.documentElement?.lang || '',
      metaDescription: getMetaDescription(),
      content,
      selection
    });
    return true;
  }
  
  if (message?.type === 'SCRAPE_GOOGLE_SERP') {
    try {
      const url = new URL(location.href);
      const q = url.searchParams.get('q') || '';
      const results = [];
      // Prefer organic results inside #search
      const headings = Array.from(document.querySelectorAll('#search a h3')).slice(0, 5);
      for (const h3 of headings) {
        const a = h3.closest('a');
        if (!a) continue;
        const title = (h3.textContent || '').trim();
        const href = a.href;
        // Try to find a snippet within the result container
        const container = h3.closest('div.g') || h3.parentElement?.parentElement || null;
        const snippetEl = container?.querySelector('.VwiC3b, .yXK7lf, .MUxGbd');
        const snippet = (snippetEl?.innerText || '').trim();
        results.push({ title, url: href, snippet });
      }
      const answerBoxCandidates = [
        '#kp-wp-tab-overview',
        'div[data-attrid="wa:/description"]',
        'div[data-attrid^="kc:/"]',
        'div[data-tts]'
      ];
      let answerBox = '';
      for (const sel of answerBoxCandidates) {
        const el = document.querySelector(sel);
        if (el && (el.innerText || '').trim()) {
          answerBox = el.innerText.trim();
          break;
        }
      }
      sendResponse({ ok: true, query: q, pageTitle: document.title || '', answerBox, results });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
    return true;
  }
});
