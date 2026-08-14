import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'icon';

/**
 * The ember accent is reserved for `primary`, so at most one button in any view
 * carries it — that is what makes it read as *the* action rather than decoration.
 */
const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:bg-accent-hover shadow-sm',
  secondary: 'bg-raised text-primary border border-subtle hover:border-strong hover:bg-sunken',
  ghost: 'text-secondary hover:bg-sunken hover:text-primary',
  danger: 'bg-[var(--color-danger)] text-white hover:brightness-110',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-8 px-2.5 text-[0.8125rem] gap-1.5',
  md: 'h-9 px-3.5 text-sm gap-2',
  // 40px hit target minimum; touch layouts widen it further via `touch-target`.
  icon: 'h-9 w-9 shrink-0',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'secondary', size = 'md', type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap',
        'transition-colors duration-[var(--duration-instant)] ease-[var(--ease-out-quick)]',
        'disabled:pointer-events-none disabled:opacity-45',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
});
