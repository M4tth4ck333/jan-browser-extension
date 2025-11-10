import { Monitor, MoveRight, Plug, PlugZap } from 'lucide-react';

import { Button, type ButtonProps } from './ui/button';

export interface TabAction {
  id: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: ButtonProps['variant'];
}

interface TabStatusCardProps {
  statusLabel: string;
  message?: string;
  actions: TabAction[];
}

export function TabStatusCard({ statusLabel, message, actions }: TabStatusCardProps) {
  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-start gap-3">
        <Monitor className="mt-1 h-4 w-4 text-primary" />
        <div className="flex-1 space-y-3">
          <div>
            <h2 className="text-base font-semibold leading-tight">{statusLabel}</h2>
            {message ? <p className="mt-1 text-sm text-muted-foreground">{message}</p> : null}
          </div>
          <div className="flex flex-col gap-2">
            {actions.map((action) => {
              const Icon =
                action.id === 'disconnect' ? PlugZap : action.id === 'register' ? Plug : MoveRight;
              return (
                <Button
                  key={action.id}
                  type="button"
                  variant={action.variant ?? 'outline'}
                  disabled={action.disabled}
                  onClick={action.onClick}
                  className="w-full justify-start"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {action.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
