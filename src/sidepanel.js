// sidepanel.js

let currentTabId = null;
let lastPageData = null;

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function loadPageData() {
  const tab = await getActiveTab();
  currentTabId = tab?.id ?? null;
  if (!currentTabId) return setStatus('No active tab.');

  try {
    const resp = await chrome.tabs.sendMessage(currentTabId, { type: 'GET_PAGE_CONTENT' });
    if (!resp?.ok) throw new Error(resp?.error || 'Failed to read page.');
    lastPageData = resp;
    renderSourceInfo(resp);
    setStatus(`Ready. Page chars: ${resp.content?.length || 0}${resp.selection ? ` • Selection chars: ${resp.selection.length}` : ''}`);
  } catch (err) {
    setStatus(`Content script not available yet. Try refresh (↻). Error: ${err.message}`);
  }
}

function renderSourceInfo({ url, title }) {
  const el = document.getElementById('source-info');
  el.innerHTML = '';
  const a = document.createElement('a');
  a.href = url;
  a.textContent = title || url || 'This page';
  a.target = '_blank';
  el.appendChild(a);
}

function setStatus(text) {
  const el = document.getElementById('status');
  el.textContent = text || '';
}

function setSummary(text) {
  const el = document.getElementById('summary-output');
  el.textContent = text || '';
}

async function summarize(useSelection = false) {
  if (!lastPageData) return setStatus('No page data yet. Refresh (↻) and try again.');
  setStatus('Summarizing...');
  setSummary('');

  const payload = {
    ...lastPageData,
    content: useSelection && lastPageData.selection ? '' : lastPageData.content,
    selection: useSelection ? lastPageData.selection : ''
  };

  try {
    const res = await chrome.runtime.sendMessage({ type: 'SUMMARIZE', payload });
    if (!res?.ok) throw new Error(res?.error || 'Unknown error');
    setSummary(res.summary);
    setStatus('Done.');
  } catch (err) {
    setStatus(`Error: ${err.message}`);
  }
}

function openOptions() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open('options.html');
  }
}

// Wire up UI
window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('open-options').addEventListener('click', openOptions);
  document.getElementById('refresh').addEventListener('click', loadPageData);
  document.getElementById('summarize').addEventListener('click', () => summarize(false));
  document.getElementById('summarize-selection').addEventListener('click', () => summarize(true));
  loadPageData();
});
