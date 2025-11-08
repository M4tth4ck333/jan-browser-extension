import { MessageTypes } from './constants.js';

const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const activateBtn = document.getElementById('activateBtn');
const gotoBtn = document.getElementById('gotoBtn');
const clearBtn = document.getElementById('clearBtn');

const state = {
  activeTab: null,
  registeredTabId: null,
  registeredTab: null,
  lastError: null,
};

function setStatus(content) {
  statusEl.innerHTML = '<strong>Status</strong>' + content;
}

function formatTab(tab, label = 'Active') {
  if (!tab) {
    return `<div>No ${label.toLowerCase()} tab detected.</div>`;
  }

  const title = tab.title ? tab.title.slice(0, 90) : 'Untitled';
  const url = tab.url ? tab.url.slice(0, 110) : '';
  return `
    <div><strong>${escapeHtml(label)}:</strong> ${escapeHtml(title)}</div>
    <div class="hint">${escapeHtml(url)}</div>
  `;
}

function updateUi() {
  const { activeTab, registeredTabId, registeredTab, lastError } = state;
  const isRegisteredActive = activeTab && activeTab.id === registeredTabId;

  let content = formatTab(activeTab);
  if (registeredTabId) {
    content += `<div style="margin-top:8px;"><strong>Registered tab ID:</strong> ${registeredTabId}</div>`;
    if (registeredTab) {
      content += `<div style="margin-top:4px;">${formatTab(registeredTab, 'Registered')}</div>`;
    }
    if (isRegisteredActive) {
      content += '<div class="hint">This tab is currently registered for MCP.</div>';
    }
  } else {
    content += '<div style="margin-top:8px;">No tab registered for MCP.</div>';
  }

  if (lastError) {
    content += `<div class="hint" style="margin-top:8px;color:#b91c1c;">${escapeHtml(lastError)}</div>`;
  }

  setStatus(content);

  activateBtn.disabled = !activeTab || isRegisteredActive;
  gotoBtn.disabled = !registeredTabId || isRegisteredActive;
  clearBtn.disabled = !registeredTabId;

  if (registeredTabId && !isRegisteredActive) {
    hintEl.textContent = 'Use "Go to MCP tab" to switch to the registered tab.';
  } else if (!registeredTabId) {
    hintEl.textContent = 'Activate the tab you want the MCP tools to control.';
  } else {
    hintEl.textContent = 'This tab is already registered for MCP tools.';
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function refreshState() {
  state.lastError = null;

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    state.activeTab = activeTab || null;
  } catch (error) {
    state.activeTab = null;
    state.lastError = 'Failed to read active tab: ' + error.message;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: MessageTypes.MCP_GET_REGISTERED_TAB });
    const tabId = response?.tabId;
    state.registeredTabId = typeof tabId === 'number' ? tabId : null;
  } catch (error) {
    state.registeredTabId = null;
    state.lastError = 'Failed to read MCP tab: ' + error.message;
  }

  if (state.registeredTabId) {
    try {
      state.registeredTab = await chrome.tabs.get(state.registeredTabId);
    } catch (_) {
      state.registeredTabId = null;
      state.registeredTab = null;
      hintEl.textContent = '';
    }
  } else {
    state.registeredTab = null;
  }

  updateUi();
}

activateBtn.addEventListener('click', async () => {
  if (!state.activeTab) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.MCP_REGISTER_TAB,
      payload: { tabId: state.activeTab.id },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Unknown error');
    }

    state.registeredTabId = state.activeTab.id;
    state.registeredTab = state.activeTab;
    state.lastError = null;
  } catch (error) {
    state.lastError = 'Failed to register tab: ' + error.message;
  }

  updateUi();
});

gotoBtn.addEventListener('click', async () => {
  if (!state.registeredTabId) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.MCP_FOCUS_REGISTERED_TAB,
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to focus tab');
    }

    state.lastError = null;
  } catch (error) {
    state.lastError = 'Failed to focus tab: ' + error.message;
  }

  await refreshState();
});

clearBtn.addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.MCP_REGISTER_TAB,
      payload: { tabId: null },
    });

    if (!response?.ok) {
      throw new Error(response?.error || 'Unable to clear tab');
    }

    state.registeredTabId = null;
    state.registeredTab = null;
    state.lastError = null;
    await refreshState();
    return;
  } catch (error) {
    state.lastError = 'Failed to clear tab: ' + error.message;
  }

  updateUi();
});

refreshState();
