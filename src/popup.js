import { DEFAULT_BRIDGE_PORT, MessageTypes } from './constants.js';

const bridgeStatusLabelEl = document.getElementById('bridgeStatusLabel');
const bridgeStatusSpinnerEl = document.getElementById('bridgeStatusSpinner');
const bridgeStatusErrorEl = document.getElementById('bridgeStatusError');
const bridgeToggleBtn = document.getElementById('bridgeToggleBtn');
const tabStatusTextEl = document.getElementById('tabStatusText');
const tabActionsEl = document.getElementById('tabActions');
const tabMessageEl = document.getElementById('tabMessage');
const openSettingsBtn = document.getElementById('openSettingsButton');
const settingsOverlayEl = document.getElementById('settingsOverlay');
const settingsCloseBtn = document.getElementById('settingsCloseButton');
const settingsCancelBtn = document.getElementById('settingsCancelButton');
const settingsSaveBtn = document.getElementById('settingsSaveButton');
const settingsMessageEl = document.getElementById('settingsMessage');
const settingsPortInput = document.getElementById('settingsPortInput');

let settingsOverlayWasOpen = false;
let settingsLastFocusedElement = null;

const state = {
  bridgeStatus: {
    status: 'idle',
    reconnecting: false,
    port: DEFAULT_BRIDGE_PORT,
    lastError: null,
  },
  activeTab: null,
  registeredTabId: null,
  tabMessage: '',
  settings: {
    open: false,
    saving: false,
    message: '',
    error: false,
  },
};

function updateBridgeStatusUi() {
  const bridge = state.bridgeStatus || {};
  const status = bridge.status || 'idle';
  const reconnecting = !!bridge.reconnecting;

  let label = 'Disconnected';
  let showSpinner = false;

  if (status === 'connecting') {
    label = 'Connecting…';
    showSpinner = true;
  } else if (status === 'connected' || status === 'ready') {
    label = 'Connected';
  } else if (status === 'disconnected' || (status === 'error' && reconnecting)) {
    label = reconnecting ? 'Reconnecting…' : 'Disconnected';
    showSpinner = reconnecting;
  } else if (status === 'error') {
    label = 'Error';
  } else if (status === 'idle') {
    label = 'Disconnected';
  }

  if (bridgeStatusLabelEl) {
    bridgeStatusLabelEl.textContent = label;
  }

  if (bridgeStatusSpinnerEl) {
    bridgeStatusSpinnerEl.hidden = !showSpinner;
  }

  if (bridgeStatusErrorEl) {
    bridgeStatusErrorEl.textContent = bridge.lastError ? String(bridge.lastError) : '';
  }

  if (bridgeToggleBtn) {
    const shouldDisconnect =
      status === 'connected' ||
      status === 'ready' ||
      status === 'connecting' ||
      (status === 'disconnected' && reconnecting) ||
      (status === 'error' && reconnecting);

    bridgeToggleBtn.dataset.action = shouldDisconnect ? 'disconnect' : 'connect';
    bridgeToggleBtn.textContent = shouldDisconnect ? 'Disconnect' : 'Connect';
    bridgeToggleBtn.disabled = state.settings.saving;
  }
}

function updateTabUi() {
  const activeTab = state.activeTab;
  const registeredTabId = state.registeredTabId;
  const tabMessage = state.tabMessage || '';

  const isActiveRegistered =
    activeTab && typeof activeTab.id === 'number' && registeredTabId === activeTab.id;
  const hasRegistered = typeof registeredTabId === 'number';

  if (tabStatusTextEl) {
    if (isActiveRegistered) {
      tabStatusTextEl.textContent = 'Current tab: Active for browser use.';
    } else if (hasRegistered) {
      tabStatusTextEl.textContent = 'Current tab: Not active for browser use.';
    } else {
      tabStatusTextEl.textContent = 'Current tab: Not active for browser use.';
    }
  }

  if (tabActionsEl) {
    tabActionsEl.innerHTML = '';

    if (!hasRegistered) {
      const button = createButton('Set current tab for browser use', handleRegisterCurrentTab);
      button.disabled = !activeTab || typeof activeTab.id !== 'number';
      tabActionsEl.appendChild(button);
    } else if (isActiveRegistered) {
      const button = createButton('Disconnect current tab', handleClearRegisteredTab);
      tabActionsEl.appendChild(button);
    } else {
      const setButton = createButton('Set current tab for browser use', handleRegisterCurrentTab);
      setButton.disabled = !activeTab || typeof activeTab.id !== 'number';
      tabActionsEl.appendChild(setButton);

      const gotoButton = createButton('Go to active tab', handleFocusRegisteredTab);
      tabActionsEl.appendChild(gotoButton);
    }
  }

  if (tabMessageEl) {
    let message = tabMessage;
    if (!message && hasRegistered && !isActiveRegistered) {
      message = 'Another tab is currently active for browser use.';
    }
    tabMessageEl.textContent = message || '';
  }
}

function updateSettingsUi() {
  if (!settingsOverlayEl) return;

  const isOpen = !!state.settings.open;

  if (isOpen && !settingsOverlayWasOpen) {
    const activeElement = document.activeElement;
    settingsLastFocusedElement =
      activeElement instanceof HTMLElement && !settingsOverlayEl.contains(activeElement)
        ? activeElement
        : openSettingsBtn instanceof HTMLElement
          ? openSettingsBtn
          : null;
  }

  if (isOpen) {
    settingsOverlayEl.hidden = false;
    settingsOverlayEl.style.display = 'flex';
    settingsOverlayEl.setAttribute('aria-hidden', 'false');
  } else {
    if (settingsOverlayWasOpen) {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && settingsOverlayEl.contains(activeElement)) {
        activeElement.blur();
      }

      let focusTarget =
        settingsLastFocusedElement instanceof HTMLElement &&
        document.contains(settingsLastFocusedElement) &&
        !settingsOverlayEl.contains(settingsLastFocusedElement)
          ? settingsLastFocusedElement
          : openSettingsBtn instanceof HTMLElement
            ? openSettingsBtn
            : null;

      if (focusTarget) {
        focusTarget.focus();
      }
    }

    settingsOverlayEl.hidden = true;
    settingsOverlayEl.style.display = 'none';
    settingsOverlayEl.setAttribute('aria-hidden', 'true');
    settingsLastFocusedElement = null;
  }

  if (settingsPortInput && isOpen && !state.settings.saving) {
    const bridgePort = state.bridgeStatus?.port;
    const port = typeof bridgePort === 'number' ? bridgePort : DEFAULT_BRIDGE_PORT;
    settingsPortInput.value = String(port);
    if (!settingsOverlayWasOpen) {
      settingsPortInput.focus();
    }
  } else if (settingsPortInput && !isOpen) {
    settingsPortInput.blur();
  }

  if (settingsMessageEl) {
    settingsMessageEl.textContent = state.settings.message || '';
    settingsMessageEl.classList.toggle('error', !!state.settings.error);
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.disabled = !!state.settings.saving;
  }

  settingsOverlayWasOpen = isOpen;
}

function updateUi() {
  updateBridgeStatusUi();
  updateTabUi();
  updateSettingsUi();
}

function createButton(label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', handler);
  return button;
}

async function refreshBridgeStatus() {
  try {
    const status = await chrome.runtime.sendMessage({ type: MessageTypes.GET_BRIDGE_STATUS });
    if (status && typeof status === 'object') {
      const nextPort =
        typeof status.port === 'number' && Number.isFinite(status.port)
          ? status.port
          : state.bridgeStatus.port ?? DEFAULT_BRIDGE_PORT;
      state.bridgeStatus = { ...state.bridgeStatus, ...status, port: nextPort };
      updateBridgeStatusUi();
    }
  } catch (error) {
    state.bridgeStatus.lastError = 'Unable to load bridge status';
    if (typeof state.bridgeStatus.port !== 'number') {
      state.bridgeStatus.port = DEFAULT_BRIDGE_PORT;
    }
    updateBridgeStatusUi();
  }
}

async function refreshTabState() {
  state.tabMessage = '';

  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    state.activeTab = activeTab || null;
  } catch (error) {
    state.activeTab = null;
    state.tabMessage = 'Unable to read current tab.';
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: MessageTypes.MCP_GET_REGISTERED_TAB });
    const tabId = response?.tabId;
    state.registeredTabId = typeof tabId === 'number' ? tabId : null;
  } catch (error) {
    state.registeredTabId = null;
    state.tabMessage = 'Unable to load active browser tab.';
  }

  updateTabUi();
}

async function handleRegisterCurrentTab() {
  if (!state.activeTab || typeof state.activeTab.id !== 'number') {
    state.tabMessage = 'No active tab available to register.';
    updateTabUi();
    return;
  }

  state.tabMessage = '';
  updateTabUi();

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.MCP_REGISTER_TAB,
      payload: { tabId: state.activeTab.id },
    });

    if (!response?.ok) {
      state.tabMessage = response?.error || 'Failed to register current tab.';
    } else {
      await refreshTabState();
      return;
    }
  } catch (error) {
    state.tabMessage = 'Failed to register current tab.';
  }

  updateTabUi();
}

async function handleClearRegisteredTab() {
  state.tabMessage = '';
  updateTabUi();

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.MCP_REGISTER_TAB,
      payload: { tabId: null },
    });
    if (!response?.ok) {
      state.tabMessage = response?.error || 'Failed to disconnect tab.';
    } else {
      await refreshTabState();
      return;
    }
  } catch (error) {
    state.tabMessage = 'Failed to disconnect tab.';
  }

  updateTabUi();
}

async function handleFocusRegisteredTab() {
  state.tabMessage = '';
  updateTabUi();

  try {
    const response = await chrome.runtime.sendMessage({ type: MessageTypes.MCP_FOCUS_REGISTERED_TAB });
    if (!response?.ok) {
      state.tabMessage = response?.error || 'Unable to switch to the active tab.';
    }
  } catch (error) {
    state.tabMessage = 'Unable to switch to the active tab.';
  }

  updateTabUi();
}

async function handleBridgeToggle() {
  if (!bridgeToggleBtn) return;
  const action = bridgeToggleBtn.dataset.action;
  if (action === 'disconnect') {
    try {
      await chrome.runtime.sendMessage({ type: MessageTypes.DISCONNECT_BRIDGE });
      await refreshBridgeStatus();
    } catch (error) {
      state.bridgeStatus.lastError = 'Failed to disconnect bridge.';
      updateBridgeStatusUi();
    }
    return;
  }

  const port =
    typeof state.bridgeStatus.port === 'number' && Number.isFinite(state.bridgeStatus.port)
      ? state.bridgeStatus.port
      : DEFAULT_BRIDGE_PORT;
  try {
    await chrome.runtime.sendMessage({ type: MessageTypes.CONNECT_BRIDGE, payload: port ? { port } : {} });
  } catch (error) {
    state.bridgeStatus.lastError = 'Failed to connect to bridge.';
  }

  await refreshBridgeStatus();
}

function openSettings() {
  state.settings.open = true;
  state.settings.saving = false;
  state.settings.message = '';
  state.settings.error = false;
  updateSettingsUi();
  if (settingsPortInput) {
    settingsPortInput.focus({ preventScroll: true });
    settingsPortInput.select();
  }
}

function closeSettings(options = {}) {
  const forceClose = options?.force === true;
  if (!forceClose && state.settings.saving) {
    return;
  }
  state.settings.open = false;
  state.settings.saving = false;
  state.settings.message = '';
  state.settings.error = false;
  updateSettingsUi();
}

function setSettingsMessage(message, isError = false) {
  state.settings.message = message;
  state.settings.error = isError;
  updateSettingsUi();
}

async function handleSettingsSave() {
  if (!settingsPortInput) return;

  const value = settingsPortInput.value.trim();
  if (!value) {
    setSettingsMessage('Port is required.', true);
    return;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    setSettingsMessage('Port must be between 1 and 65535.', true);
    return;
  }

  if (parsed === state.bridgeStatus.port) {
    closeSettings();
    return;
  }

  state.settings.saving = true;
  setSettingsMessage('Saving…');

  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.UPDATE_BRIDGE_PORT,
      payload: { port: parsed },
    });

    if (!response?.ok) {
      setSettingsMessage(response?.error || 'Failed to save port.', true);
    } else {
      setSettingsMessage('Port saved. Bridge disconnected.');
      state.settings.saving = false;
      state.bridgeStatus.port = parsed;
      closeSettings();
      await refreshBridgeStatus();
      return;
    }
  } catch (error) {
    setSettingsMessage('Failed to save port.', true);
  }

  state.settings.saving = false;
  updateSettingsUi();
}

function handleSettingsCancel() {
  closeSettings({ force: true });
}

function setupEventListeners() {
  if (bridgeToggleBtn) {
    bridgeToggleBtn.addEventListener('click', handleBridgeToggle);
  }

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', openSettings);
  }

  if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', () => closeSettings({ force: true }));
  }

  if (settingsCancelBtn) {
    settingsCancelBtn.addEventListener('click', handleSettingsCancel);
  }

  if (settingsSaveBtn) {
    settingsSaveBtn.addEventListener('click', handleSettingsSave);
  }

  if (settingsOverlayEl) {
    settingsOverlayEl.addEventListener('click', (event) => {
      if (event.target === settingsOverlayEl) {
        closeSettings({ force: true });
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.settings.open) {
      closeSettings({ force: true });
    }
  });

  if (settingsPortInput) {
    settingsPortInput.addEventListener('input', () => {
      if (state.settings.message) {
        state.settings.message = '';
        state.settings.error = false;
        updateSettingsUi();
      }
    });
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === MessageTypes.BRIDGE_STATUS_UPDATED) {
      const payload = message.payload || {};
      const nextPort =
        typeof payload.port === 'number' && Number.isFinite(payload.port)
          ? payload.port
          : state.bridgeStatus.port ?? DEFAULT_BRIDGE_PORT;
      state.bridgeStatus = { ...state.bridgeStatus, ...payload, port: nextPort };
      updateBridgeStatusUi();
    }
  });
}

async function init() {
  updateSettingsUi();
  setupEventListeners();
  await Promise.all([refreshBridgeStatus(), refreshTabState()]);
}

init().catch((error) => {
  console.error('[Popup] Initialization error:', error);
});
