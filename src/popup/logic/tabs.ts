import { MessageTypes } from '../../constants.js';

export interface ActiveTabInfo {
  id: number;
  title?: string | null;
  url?: string | null;
}

export interface ActiveTabResult {
  tab: ActiveTabInfo | null;
  error?: string;
}

export async function fetchActiveTab(): Promise<ActiveTabResult> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab && typeof activeTab.id === 'number') {
      return {
        tab: {
          id: activeTab.id,
          title: activeTab.title ?? null,
          url: activeTab.url ?? null,
        },
      };
    }
    return { tab: null };
  } catch (error) {
    console.warn('[Popup] Failed to read active tab:', error);
    return { tab: null, error: 'Unable to read current tab.' };
  }
}

export interface RegisteredTabResult {
  tabId: number | null;
  error?: string;
}

export async function fetchRegisteredTabId(): Promise<RegisteredTabResult> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MessageTypes.MCP_GET_REGISTERED_TAB });
    const tabId = response?.tabId;
    return { tabId: typeof tabId === 'number' ? tabId : null };
  } catch (error) {
    console.warn('[Popup] Failed to fetch registered tab:', error);
    return { tabId: null, error: 'Unable to load active browser tab.' };
  }
}

export async function registerTab(tabId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.MCP_REGISTER_TAB,
      payload: { tabId },
    });
    if (response?.ok) {
      return { ok: true };
    }
    return { ok: false, error: String(response?.error || 'Failed to register current tab.') };
  } catch (error) {
    return { ok: false, error: 'Failed to register current tab.' };
  }
}

export async function clearRegisteredTab(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.MCP_REGISTER_TAB,
      payload: { tabId: null },
    });
    if (response?.ok) {
      return { ok: true };
    }
    return { ok: false, error: String(response?.error || 'Failed to disconnect tab.') };
  } catch (error) {
    return { ok: false, error: 'Failed to disconnect tab.' };
  }
}

export async function focusRegisteredTab(): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MessageTypes.MCP_FOCUS_REGISTERED_TAB });
    if (response?.ok) {
      return { ok: true };
    }
    return { ok: false, error: String(response?.error || 'Unable to switch to the active tab.') };
  } catch (error) {
    return { ok: false, error: 'Unable to switch to the active tab.' };
  }
}
