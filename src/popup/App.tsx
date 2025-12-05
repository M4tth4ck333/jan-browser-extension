import { Loader2, Plug, PlugZap, Settings } from 'lucide-react';

import { SettingsOverlay } from './components/SettingsOverlay';
import { ProfileStatusCard } from './components/ProfileStatusCard';
import { TabStatusCard } from './components/TabStatusCard';
import { Button } from './components/ui/button';
import { useExtensionState } from './hooks/useExtensionState';
import { cn } from './lib/utils';

export default function App() {
  const { bridge, tab, profile, settings, actions } = useExtensionState();
  const ConnectionIcon = bridge.tone === 'connected' ? PlugZap : Plug;
  const connectionHover =
    bridge.tone === 'connected' ? 'Connected' : bridge.tone === 'connecting' ? 'Connecting…' : 'Not connected';

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
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => actions.toggleBridge(bridge.action)}
            disabled={settings.saving}
            className={cn(
              'shadow-sm',
              bridge.tone === 'connected'
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                : bridge.tone === 'connecting'
                  ? 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                  : 'bg-red-100 text-red-700 hover:bg-red-200',
            )}
            title={connectionHover}
            aria-label={connectionHover}
            size="icon"
          >
            {bridge.showSpinner ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ConnectionIcon className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={actions.openSettings}
            aria-label="Open settings"
            title="Configure bridge settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {profile.showSelector ? (
        <div className="space-y-3">
          <ProfileStatusCard
            label={profile.label}
            statusLabel={profile.statusLabel}
            isActive={profile.isActive}
            actionLabel={profile.actionLabel}
            onActivate={profile.isActive ? undefined : actions.activateProfile}
          />
        </div>
      ) : null}

      {!profile.hideTabSection ? (
        <div className="space-y-3">
          <TabStatusCard statusLabel={tab.statusLabel} message={tab.message} actions={tab.actions} />
        </div>
      ) : null}

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
