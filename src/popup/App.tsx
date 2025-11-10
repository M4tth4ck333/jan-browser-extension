import { Settings } from 'lucide-react';

import { BridgeStatusCard } from './components/BridgeStatusCard';
import { SettingsOverlay } from './components/SettingsOverlay';
import { TabStatusCard } from './components/TabStatusCard';
import { Button } from './components/ui/button';
import { useExtensionState } from './hooks/useExtensionState';

export default function App() {
  const { bridge, tab, settings, actions } = useExtensionState();

  const handleSettingsOpenChange = (open: boolean) => {
    if (open) {
      actions.openSettings();
    } else {
      actions.closeSettings();
    }
  };

  return (
    <div className="min-w-[320px] max-w-[380px] space-y-4 p-4">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold leading-tight">Jan Browser MCP</h1>
          <p className="text-sm text-muted-foreground">
            Manage the MCP bridge connection and active browser tab.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={actions.openSettings}
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </header>

      <div className="space-y-3">
        <BridgeStatusCard
          statusLabel={bridge.statusLabel}
          detail={bridge.detail}
          lastError={bridge.state.lastError}
          actionLabel={bridge.actionLabel}
          action={bridge.action}
          showSpinner={bridge.showSpinner}
          disabled={settings.saving}
          onToggle={actions.toggleBridge}
        />
        <TabStatusCard statusLabel={tab.statusLabel} message={tab.message} actions={tab.actions} />
      </div>

      <SettingsOverlay
        open={settings.open}
        currentPort={bridge.state.port}
        saving={settings.saving}
        message={settings.message}
        isError={settings.error}
        onOpenChange={handleSettingsOpenChange}
        onSubmit={actions.savePort}
        onResetMessage={actions.resetSettingsMessage}
      />
    </div>
  );
}
