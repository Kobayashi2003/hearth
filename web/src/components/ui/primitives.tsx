import {
  forwardRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '@/lib/cn';

/** Small shared primitives. Anything with real behaviour gets its own file. */

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return (
      <input
        ref={ref}
        className={cn(
          'h-9 w-full rounded-md border border-subtle bg-raised px-3 text-sm text-primary',
          'placeholder:text-muted focus:border-accent focus-visible:outline-none',
          'transition-colors duration-[--duration-instant]',
          className,
        )}
        {...props}
      />
    );
  },
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          'h-9 rounded-md border border-subtle bg-raised px-2.5 text-sm text-primary',
          'focus:border-accent focus-visible:outline-none',
          className,
        )}
        {...props}
      />
    );
  },
);

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[0.8125rem] font-medium text-secondary">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </label>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <div className="text-sm font-medium text-primary">{label}</div>
        {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
      </div>
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border border-subtle transition-colors',
          'duration-[--duration-instant] data-[state=checked]:border-accent',
          'data-[state=checked]:bg-accent data-[state=unchecked]:bg-sunken',
        )}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            'block h-3.5 w-3.5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform',
            'duration-[--duration-instant] data-[state=checked]:translate-x-4',
          )}
        />
      </SwitchPrimitive.Root>
    </div>
  );
}

/**
 * Tooltips carry the explanation for controls that are icons — pin, minimise,
 * density. Discoverability was the main complaint about the previous UI, so an
 * unlabelled control without a tooltip is a bug.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className={cn(
            'z-50 rounded-md border border-subtle bg-overlay px-2 py-1 text-xs text-primary',
            'shadow-md select-none',
          )}
        >
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        'inline-block h-4 w-4 animate-spin rounded-full border-2 border-strong',
        'border-t-accent',
        className,
      )}
    />
  );
}

/**
 * Empty, loading and error states are designed rather than defaulted: each one
 * says what happened and offers the action that resolves it.
 */
export function StatusPanel({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {icon ? <div className="text-muted">{icon}</div> : null}
      <div>
        <p className="text-sm font-medium text-primary">{title}</p>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

/** A placeholder shaped like the content it stands in for, not a generic bar. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('animate-pulse rounded bg-sunken', className)} {...props} />;
}
