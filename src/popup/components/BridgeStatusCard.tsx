import { Loader2, Plug, PlugZap } from 'lucide-react';

import { Button } from './ui/button';

interface BridgeStatusCardProps {
  statusLabel: string;
  detail?: string | null;
  lastError?: string | null;
  actionLabel: string;
  action: 'connect' | 'disconnect';
  showSpinner: boolean;
  disabled?: boolean;
  onToggle: (action: 'connect' | 'disconnect') => void;
}

export function BridgeStatusCard({
  statusLabel,
  detail,
  lastError,
  actionLabel,
  action,
  showSpinner,
  disabled,
  onToggle,
}: BridgeStatusCardProps) {
  const Icon = action === 'disconnect' ? PlugZap : Plug;
  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">Bridge</p>
          <div className="flex items-center gap-2">
            {showSpinner ? <Loader2 className="h-4 w-4 animate-spin text-primary" /> : <Icon className="h-4 w-4 text-primary" />}
            <h2 className="text-base font-semibold leading-tight">{statusLabel}</h2>
          </div>
          {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
        </div>
        <Button
          type="button"
          onClick={() => onToggle(action)}
          disabled={disabled}
          variant={action === 'disconnect' ? 'outline' : 'default'}
        >
          {actionLabel}
        </Button>
      </div>
      {lastError ? <p className="mt-3 text-sm text-destructive">{lastError}</p> : null}
    </section>
  );
}
