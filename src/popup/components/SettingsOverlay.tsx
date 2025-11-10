import * as React from 'react';

import { Button } from './ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface SettingsOverlayProps {
  open: boolean;
  currentPort: number;
  saving: boolean;
  message: string;
  isError: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (value: string) => void;
  onResetMessage: () => void;
}

export function SettingsOverlay({
  open,
  currentPort,
  saving,
  message,
  isError,
  onOpenChange,
  onSubmit,
  onResetMessage,
}: SettingsOverlayProps) {
  const [value, setValue] = React.useState('');

  React.useEffect(() => {
    if (open) {
      setValue(String(currentPort ?? ''));
    }
  }, [open, currentPort]);

  const handleSubmit = React.useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      onSubmit(value);
    },
    [onSubmit, value],
  );

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onResetMessage();
      }
      onOpenChange(nextOpen);
    },
    [onOpenChange, onResetMessage],
  );

  const handleValueChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (message) {
        onResetMessage();
      }
      setValue(event.target.value);
    },
    [message, onResetMessage],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Configure the MCP bridge connection.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="bridge-port">Bridge port</Label>
            <Input
              id="bridge-port"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min={1}
              max={65535}
              value={value}
              onChange={handleValueChange}
              disabled={saving}
              required
            />
          </div>
          {message ? (
            <p className={`text-sm ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>{message}</p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={saving}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
