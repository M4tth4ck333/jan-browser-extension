import { ShieldCheck, UserRound } from 'lucide-react';

import { Button } from './ui/button';

interface ProfileStatusCardProps {
  label: string;
  statusLabel: string;
  isActive: boolean;
  actionLabel?: string;
  onActivate?: () => void;
}

export function ProfileStatusCard({
  label,
  statusLabel,
  isActive,
  actionLabel,
  onActivate,
}: ProfileStatusCardProps) {
  return (
    <section className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm">
      <div className="flex items-start gap-3">
        {isActive ? (
          <ShieldCheck className="mt-1 h-4 w-4 text-primary" />
        ) : (
          <UserRound className="mt-1 h-4 w-4 text-primary" />
        )}
        <div className="flex-1 space-y-3">
          <div>
            <h2 className="text-base font-semibold leading-tight">{label}</h2>
            <p className="text-sm text-muted-foreground">{statusLabel}</p>
          </div>
          {!isActive ? (
            <div className="flex flex-col gap-2">
              {actionLabel ? (
                <Button type="button" variant="default" onClick={onActivate} className="w-full justify-center">
                  {actionLabel}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
