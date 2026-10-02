import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

type Variant = 'primary' | 'quiet' | 'outline' | 'danger' | 'stage';
type Size = 'sm' | 'md' | 'icon';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-glaze text-glaze-ink hover:bg-glaze-strong font-semibold',
  quiet: 'text-ink-2 hover:bg-sunken hover:text-ink',
  outline: 'border border-line bg-surface text-ink hover:border-ink-3',
  danger: 'bg-danger text-white hover:brightness-110 font-semibold',
  stage: 'text-stage-ink/80 hover:bg-white/10 hover:text-stage-ink',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5 justify-center whitespace-nowrap',
  md: 'h-9 px-3.5 text-sm gap-2 justify-center whitespace-nowrap',
  icon: 'size-tap shrink-0 justify-center',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'quiet', size = 'md', className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex select-none items-center rounded-lg transition-colors duration-100',
        'disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-[18px] [&_svg]:shrink-0',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    />
  );
});
