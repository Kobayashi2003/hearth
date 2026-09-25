import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { Button } from './Button';

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)]" />
        <RadixDialog.Content
          className={cn(
            'animate-rise fixed left-1/2 top-[12vh] z-50 flex max-h-[80vh] w-[min(28rem,calc(100vw-2rem))]',
            '-translate-x-1/2 flex-col rounded-2xl border border-line bg-surface shadow-float outline-none',
            className,
          )}
        >
          <div className="flex items-start gap-3 px-5 pb-2 pt-4">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-[17px] font-semibold">{title}</RadixDialog.Title>
              {description ? (
                <RadixDialog.Description className="mt-1 text-[13px] text-ink-2">
                  {description}
                </RadixDialog.Description>
              ) : (
                <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
              )}
            </div>
            <RadixDialog.Close asChild>
              <Button size="icon" aria-label="Close" className="-mr-2 -mt-1">
                <X />
              </Button>
            </RadixDialog.Close>
          </div>
          {children ? (
            <div className="scroll-thin min-h-0 overflow-auto px-5 py-2">{children}</div>
          ) : null}
          {footer ? <div className="flex justify-end gap-2 px-5 pb-4 pt-3">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
