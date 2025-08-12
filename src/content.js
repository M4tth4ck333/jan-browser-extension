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
});
