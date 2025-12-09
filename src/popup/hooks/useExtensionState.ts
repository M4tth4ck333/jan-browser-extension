import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DEFAULT_BRIDGE_PORT } from '../../constants.js';
import {
  connectBridge,
  disconnectBridge,
  fetchBridgeStatus,
  persistBridgePort,
  subscribeToBridgeUpdates,
  activateCurrentProfile,
  fetchWebStatus,
  subscribeToWebUpdates,
  type BridgeStatus,
  type WebStatus,
} from '../logic/bridge';
import {
  clearRegisteredTab,
  fetchActiveTab,
  fetchRegisteredTabId,
  focusRegisteredTab,
  registerTab,
  type ActiveTabInfo,
} from '../logic/tabs';
import type { TabAction } from '../components/TabStatusCard';

interface BridgeState extends BridgeStatus {
  port: number;
  lastError: string | null;
}

interface TabState {
  activeTab: ActiveTabInfo | null;
  registeredTabId: number | null;
  message: string;
}

interface SettingsState {
  open: boolean;
  saving: boolean;
  message: string;
  error: boolean;
}

export interface UseExtensionStateResult {
  bridge: {
    state: BridgeState;
    statusLabel: string;
    detail: string;
    action: 'connect' | 'disconnect';
    actionLabel: string;
    showSpinner: boolean;
    tone: 'connected' | 'connecting' | 'disconnected';
  };
  web: {
    connected: boolean;
    count: number;
  };
  tab: {
    state: TabState;
    statusLabel: string;
    message: string;
    actions: TabAction[];
  };
  profile: {
    showSelector: boolean;
    isActive: boolean;
    label: string;
    statusLabel: string;
    actionLabel?: string;
    hideTabSection: boolean;
  };
  settings: SettingsState;
  actions: {
    refresh: () => Promise<void>;
    toggleBridge: (action: 'connect' | 'disconnect') => Promise<void>;
    openSettings: () => void;
    closeSettings: () => void;
    resetSettingsMessage: () => void;
    savePort: (value: string) => Promise<void>;
    activateProfile: () => Promise<void>;
  };
}

const INITIAL_BRIDGE_STATE: BridgeState = {
  status: 'idle',
  reconnecting: false,
  port: DEFAULT_BRIDGE_PORT,
  lastError: null,
  profileId: null,
  profileLabel: null,
  activeProfileId: null,
  profileCount: 1,
  isActiveProfile: true,
};

const INITIAL_TAB_STATE: TabState = {
  activeTab: null,
  registeredTabId: null,
  message: '',
};

const INITIAL_SETTINGS_STATE: SettingsState = {
  open: false,
  saving: false,
  message: '',
  error: false,
};

const INITIAL_WEB_STATUS: WebStatus = {
  connected: false,
  count: 0,
};

function computeBridgeUi(state: BridgeState) {
  const status = state.status || 'idle';
  const reconnecting = Boolean(state.reconnecting);
  let statusLabel = 'Disconnected';
  let showSpinner = false;
  let tone: 'connected' | 'connecting' | 'disconnected' = 'disconnected';

  if (status === 'connecting') {
    statusLabel = 'Connecting…';
    showSpinner = true;
    tone = 'connecting';
  } else if (status === 'connected' || status === 'ready') {
    statusLabel = 'Connected';
    tone = 'connected';
  } else if (status === 'disconnected' || (status === 'error' && reconnecting)) {
    statusLabel = reconnecting ? 'Reconnecting…' : 'Disconnected';
    showSpinner = reconnecting;
    tone = reconnecting ? 'connecting' : 'disconnected';
  } else if (status === 'error') {
    statusLabel = 'Error';
    tone = 'disconnected';
  }

  const action: 'connect' | 'disconnect' =
    status === 'connected' ||
    status === 'ready' ||
    status === 'connecting' ||
    (status === 'disconnected' && reconnecting) ||
    (status === 'error' && reconnecting)
      ? 'disconnect'
      : 'connect';

  const actionLabel = action === 'disconnect' ? 'Disconnect' : 'Connect';
  const detailParts = [`Port ${state.port}`];
  const detail = detailParts.join(' • ');

  return { statusLabel, detail, action, actionLabel, showSpinner, tone };
}

function buildTabActions(options: {
  hasRegistered: boolean;
  isActiveRegistered: boolean;
  canRegister: boolean;
  registerCurrentTab: () => Promise<void>;
  clearRegisteredTab: () => Promise<void>;
  focusRegisteredTab: () => Promise<void>;
}): TabAction[] {
  const actions: TabAction[] = [];
  if (!options.hasRegistered) {
    actions.push({
      id: 'register',
      label: 'Set current tab for browser use',
      onClick: options.registerCurrentTab,
      disabled: !options.canRegister,
      variant: 'default',
    });
    return actions;
  }

  if (options.isActiveRegistered) {
    actions.push({
      id: 'disconnect',
      label: 'Disconnect current tab',
      onClick: options.clearRegisteredTab,
      variant: 'outline',
    });
    return actions;
  }

  actions.push({
    id: 'register',
    label: 'Set current tab for browser use',
    onClick: options.registerCurrentTab,
    disabled: !options.canRegister,
    variant: 'default',
  });
  actions.push({
    id: 'focus',
    label: 'Go to active tab',
    onClick: options.focusRegisteredTab,
    variant: 'outline',
  });
  return actions;
}

export function useExtensionState(): UseExtensionStateResult {
  const [bridgeState, setBridgeState] = useState<BridgeState>(INITIAL_BRIDGE_STATE);
  const [webStatus, setWebStatus] = useState<WebStatus>(INITIAL_WEB_STATUS);
  const [tabState, setTabState] = useState<TabState>(INITIAL_TAB_STATE);
  const [settingsState, setSettingsState] = useState<SettingsState>(INITIAL_SETTINGS_STATE);
  const autoConnectAttemptedRef = useRef(false);

  const refreshBridge = useCallback(async () => {
    const status = await fetchBridgeStatus();
    setBridgeState((current) => {
      const nextPort =
        typeof status?.port === 'number' && Number.isFinite(status.port)
          ? Math.trunc(status.port)
          : current.port ?? DEFAULT_BRIDGE_PORT;
      const nextLastError =
        status && 'lastError' in status
          ? status.lastError == null
            ? null
            : String(status.lastError)
          : current.lastError;
      return {
        ...current,
        ...(status ?? {}),
        port: nextPort,
        lastError: nextLastError,
      };
    });
  }, []);

  const refreshWeb = useCallback(async () => {
    const status = await fetchWebStatus();
    setWebStatus(status);
  }, []);

  const refreshTab = useCallback(async () => {
    const [active, registered] = await Promise.all([fetchActiveTab(), fetchRegisteredTabId()]);
    setTabState((current) => ({
      ...current,
      activeTab: active.tab,
      registeredTabId: registered.tabId,
      message: active.error || registered.error || '',
    }));
  }, []);

  // Subscribe to bridge status updates
  useEffect(() => {
    const unsubscribe = subscribeToBridgeUpdates((update) => {
      setBridgeState((current) => {
        const nextPort =
          typeof update.port === 'number' && Number.isFinite(update.port)
            ? Math.trunc(update.port)
            : current.port ?? DEFAULT_BRIDGE_PORT;
        const nextLastError =
          'lastError' in update
            ? update.lastError == null
              ? null
              : String(update.lastError)
            : current.lastError;
        return {
          ...current,
          ...update,
          port: nextPort,
          lastError: nextLastError,
        };
      });
    });

    return unsubscribe;
  }, []);

  // Subscribe to web status updates
  useEffect(() => {
    const unsubscribe = subscribeToWebUpdates((update) => {
      setWebStatus(update);
    });

    return unsubscribe;
  }, []);

  // Initial fetch
  useEffect(() => {
    void refreshBridge();
    void refreshWeb();
    void refreshTab();
  }, [refreshBridge, refreshWeb, refreshTab]);

  // Auto-connect to bridge on mount
  useEffect(() => {
    if (autoConnectAttemptedRef.current) return;
    autoConnectAttemptedRef.current = true;
    void connectBridge({ auto: true });
  }, []);

  const registerCurrentTab = useCallback(async () => {
    const activeId = tabState.activeTab?.id;
    if (typeof activeId !== 'number') {
      setTabState((current) => ({ ...current, message: 'No active tab available to register.' }));
      return;
    }

    setTabState((current) => ({ ...current, message: '' }));
    const result = await registerTab(activeId);
    if (!result.ok) {
      setTabState((current) => ({ ...current, message: result.error ?? 'Failed to register current tab.' }));
      return;
    }
    await refreshTab();
  }, [tabState.activeTab?.id, refreshTab]);

  const clearRegistered = useCallback(async () => {
    setTabState((current) => ({ ...current, message: '' }));
    const result = await clearRegisteredTab();
    if (!result.ok) {
      setTabState((current) => ({ ...current, message: result.error ?? 'Failed to disconnect tab.' }));
      return;
    }
    await refreshTab();
  }, [refreshTab]);

  const focusRegistered = useCallback(async () => {
    setTabState((current) => ({ ...current, message: '' }));
    const result = await focusRegisteredTab();
    if (!result.ok) {
      setTabState((current) => ({ ...current, message: result.error ?? 'Unable to switch to the active tab.' }));
      return;
    }
    await refreshTab();
  }, [refreshTab]);

  const activateProfile = useCallback(async () => {
    const ok = await activateCurrentProfile();
    if (!ok) {
      setBridgeState((current) => ({ ...current, lastError: 'Failed to activate this profile.' }));
    }
    await refreshBridge();
  }, [refreshBridge]);

  const toggleBridge = useCallback(
    async (action: 'connect' | 'disconnect') => {
      if (action === 'disconnect') {
        const ok = await disconnectBridge();
        if (!ok) {
          setBridgeState((current) => ({
            ...current,
            lastError: 'Failed to disconnect bridge.',
          }));
        }
        await refreshBridge();
        return;
      }

      const port = bridgeState.port ?? DEFAULT_BRIDGE_PORT;
      const ok = await connectBridge({ port });
      if (!ok) {
        setBridgeState((current) => ({
          ...current,
          lastError: 'Failed to connect bridge.',
        }));
      }
      await refreshBridge();
    },
    [bridgeState.port, refreshBridge],
  );

  const openSettings = useCallback(() => {
    setSettingsState((current) => ({ ...current, open: true, message: '', error: false }));
  }, []);

  const closeSettings = useCallback(() => {
    setSettingsState((current) => ({ ...current, open: false }));
  }, []);

  const resetSettingsMessage = useCallback(() => {
    setSettingsState((current) => ({ ...current, message: '', error: false }));
  }, []);

  const savePort = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setSettingsState((current) => ({ ...current, message: 'Port is required.', error: true }));
        return;
      }

      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
        setSettingsState((current) => ({
          ...current,
          message: 'Port must be between 1 and 65535.',
          error: true,
        }));
        return;
      }

      if (parsed === bridgeState.port) {
        closeSettings();
        return;
      }

      setSettingsState((current) => ({ ...current, saving: true, message: 'Saving…', error: false }));
      const result = await persistBridgePort(parsed);
      if (!result.ok) {
        setSettingsState((current) => ({
          ...current,
          saving: false,
          message: result.error ?? 'Failed to save port.',
          error: true,
        }));
        return;
      }

      setBridgeState((current) => ({ ...current, port: parsed }));
      setSettingsState((current) => ({ ...current, saving: false, open: false, message: '', error: false }));
      const ok = await connectBridge({ port: parsed });
      if (!ok) {
        setBridgeState((current) => ({ ...current, lastError: 'Failed to connect bridge.' }));
      }
      await refreshBridge();
    },
    [bridgeState.port, closeSettings, refreshBridge],
  );

  const bridgeUi = useMemo(() => computeBridgeUi(bridgeState), [bridgeState]);

  const tabUi = useMemo(() => {
    const hasRegistered = typeof tabState.registeredTabId === 'number';
    const isActiveRegistered =
      hasRegistered && typeof tabState.activeTab?.id === 'number'
        ? tabState.activeTab.id === tabState.registeredTabId
        : false;
    const canRegister = typeof tabState.activeTab?.id === 'number';
    const message =
      tabState.message || (hasRegistered && !isActiveRegistered ? 'Another tab is currently active for browser use.' : '');
    const statusLabel = isActiveRegistered
      ? 'Current tab: Active for browser use.'
      : 'Current tab: Not active for browser use.';
    const actions = buildTabActions({
      hasRegistered,
      isActiveRegistered,
      canRegister,
      registerCurrentTab,
      clearRegisteredTab: clearRegistered,
      focusRegisteredTab: focusRegistered,
    });

    return { state: tabState, statusLabel, message, actions };
  }, [tabState, registerCurrentTab, clearRegistered, focusRegistered]);

  const profileUi = useMemo(() => {
    const profileCount = bridgeState.profileCount ?? 1;
    const isActive = bridgeState.isActiveProfile !== false;
    const label = 'User Profile';
    const showSelector = profileCount > 1;
    const hideTabSection = showSelector && !isActive;
    const statusLabel = isActive ? 'Status: Active' : 'Status: Not Active';
    const actionLabel = !isActive ? 'Use this Profile' : undefined;

    return { showSelector, isActive, label, statusLabel, actionLabel, hideTabSection };
  }, [bridgeState.profileCount, bridgeState.isActiveProfile]);

  return {
    bridge: { state: bridgeState, ...bridgeUi },
    web: webStatus,
    tab: tabUi,
    profile: profileUi,
    settings: settingsState,
    actions: {
      refresh: async () => {
        await Promise.all([refreshBridge(), refreshWeb(), refreshTab()]);
      },
      toggleBridge,
      openSettings,
      closeSettings,
      resetSettingsMessage,
      savePort,
      activateProfile,
    },
  };
}
