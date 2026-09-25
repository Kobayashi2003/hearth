import * as RadixSwitch from '@radix-ui/react-switch';
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';

import { cn } from '@/lib/cn';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint ? <span className="text-[12px] text-ink-3">{hint}</span> : null}
    </label>
  );
}

const control =
  'h-9 w-full rounded-lg border border-line bg-bg px-3 text-sm text-ink outline-none transition-colors ' +
  'placeholder:text-ink-3 focus:border-glaze';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={cn(control, className)} {...rest} />;
  },
);

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(control, 'pr-8', className)} {...rest} />;
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      disabled={disabled}
      className="relative h-6 w-10 shrink-0 rounded-full bg-sunken transition-colors data-[state=checked]:bg-glaze disabled:opacity-50"
    >
      <RadixSwitch.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[18px]" />
    </RadixSwitch.Root>
  );
}

/** A labelled row with a control on the right, for settings lists. */
export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {description ? <div className="mt-0.5 text-[12.5px] text-ink-3">{description}</div> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Mutually exclusive options shown side by side. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode; title?: string }>;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-sunken p-0.5">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[13px] text-ink-2 [&_svg]:size-4',
            option.value === value && 'bg-surface text-ink shadow-sm',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
