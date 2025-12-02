import { DEFAULT_BRIDGE_PORT, MessageTypes } from '../../constants.js';

export interface BridgeStatus {
  status: string;
  reconnecting?: boolean;
  port?: number;
  lastError?: string | null;
  autoReconnectDisabled?: boolean;
}

export async function fetchBridgeStatus(): Promise<BridgeStatus | null> {
  try {
    const status = await chrome.runtime.sendMessage({ type: MessageTypes.GET_BRIDGE_STATUS });
    if (status && typeof status === 'object') {
      return status as BridgeStatus;
    }
  } catch (error) {
    console.warn('[Popup] Failed to fetch bridge status:', error);
  }
  return null;
}

export async function connectBridge(options: { port?: number; auto?: boolean } = {}): Promise<boolean> {
  const port = typeof options.port === 'number' ? options.port : DEFAULT_BRIDGE_PORT;
  const auto = options.auto === true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.CONNECT_BRIDGE,
      payload: { port, auto },
    });
    return Boolean(response?.ok);
  } catch (error) {
    console.warn('[Popup] Failed to connect bridge:', error);
    return false;
  }
}

export async function disconnectBridge(): Promise<boolean> {
  try {
    const response = await chrome.runtime.sendMessage({ type: MessageTypes.DISCONNECT_BRIDGE });
    return Boolean(response?.ok);
  } catch (error) {
    console.warn('[Popup] Failed to disconnect bridge:', error);
    return false;
  }
}

export async function persistBridgePort(port: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await chrome.runtime.sendMessage({
      type: MessageTypes.UPDATE_BRIDGE_PORT,
      payload: { port },
    });
    if (response?.ok) {
      return { ok: true };
    }
    return { ok: false, error: String(response?.error || 'Failed to save port.') };
  } catch (error) {
    return { ok: false, error: 'Failed to save port.' };
  }
}

export type BridgeStatusListener = (update: Partial<BridgeStatus>) => void;

export function subscribeToBridgeUpdates(listener: BridgeStatusListener) {
  const handler = (message: unknown) => {
    if (typeof message !== 'object' || !message) return;
    const typed = message as { type?: string; payload?: Partial<BridgeStatus> };
    if (typed.type === MessageTypes.BRIDGE_STATUS_UPDATED) {
      listener(typed.payload ?? {});
    }
  };

  chrome.runtime.onMessage.addListener(handler);
  return () => {
    chrome.runtime.onMessage.removeListener(handler);
  };
}
