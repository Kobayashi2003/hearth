import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

/** One shell for every dialog, so they all dismiss and focus the same way. */
export function DialogShell({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer: ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)]" />
        <Dialog.Content
          className={cn(
            'fixed z-50 border border-subtle bg-overlay shadow-2xl',
            // A sheet on a phone, a centred dialog on a larger screen.
            'inset-x-0 bottom-0 rounded-t-xl p-5',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(26rem,calc(100vw-2rem))]',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-xl',
          )}
        >
          <Dialog.Title className="text-base font-semibold text-primary">{title}</Dialog.Title>
          {description ? (
            <Dialog.Description className="mt-1 text-sm text-muted">{description}</Dialog.Description>
          ) : null}

          {children ? <div className="mt-4">{children}</div> : null}

          <div className="mt-5 flex justify-end gap-2">{footer}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Create a folder, or rename an item — the same shape with different words. */
export function NameDialog({
  open,
  onOpenChange,
  title,
  label,
  initialValue = '',
  confirmLabel,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  onConfirm: (name: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    onConfirm(trimmed);
    onOpenChange(false);
  }

  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!value.trim()}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Field label={label}>
        <Input
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={event => event.key === 'Enter' && submit()}
          autoFocus
        />
      </Field>
    </DialogShell>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  isDestructive,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  isDestructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant={isDestructive ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}
