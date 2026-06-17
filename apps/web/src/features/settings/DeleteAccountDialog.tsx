'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The account email the user must type to confirm. */
  expectedEmail: string;
  isPending: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
}

/**
 * Confirmation modal for permanently deleting an account. The user must type
 * their exact email (compared case-insensitively) before the destructive
 * action is enabled.
 */
export function DeleteAccountDialog({
  open,
  onOpenChange,
  expectedEmail,
  isPending,
  errorMessage,
  onConfirm,
}: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (!open) setValue('');
  }, [open]);

  const isMatch = value.trim().toLowerCase() === expectedEmail.trim().toLowerCase();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (isPending) return;
        onOpenChange(next);
      }}
    >
      <DialogContent
        onEscapeKeyDown={(e) => {
          if (isPending) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isPending) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="text-destructive">Delete your account?</DialogTitle>
          <DialogDescription>
            This permanently deletes your account and all associated data. This action cannot be
            undone.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!isMatch) return;
            onConfirm();
          }}
        >
          <Label htmlFor="confirm-email" className="text-sm">
            To confirm, type{' '}
            <span className="text-foreground font-mono font-semibold">{expectedEmail}</span> below:
          </Label>
          <Input
            id="confirm-email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            disabled={isPending}
            placeholder={expectedEmail}
          />
          {errorMessage ? <p className="text-destructive text-sm">{errorMessage}</p> : null}

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={isPending || !isMatch}>
              {isPending ? 'Deleting…' : 'Delete account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
