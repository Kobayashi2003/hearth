import { cn } from '@/lib/cn';

/** Kept in step with `public/favicon.svg`. */
export const FLAME =
  'M16 6.5C17.6 9 22.2 12.3 22.2 16.6C22.2 19.9 19.5 22 16 22C12.5 22 9.8 19.9 9.8 16.6' +
  'C9.8 14.2 11.1 12.3 12.6 11C12.6 12.9 13.5 14.1 14.8 14.5C14.3 11.6 14.8 8.8 16 6.5Z';
export const CORE =
  'M16 14.2C17.8 15.8 18.7 17.1 18.7 18.4C18.7 19.9 17.5 20.9 16 20.9C14.5 20.9 13.3 19.9 13.3 18.4' +
  'C13.3 17.1 14.3 15.7 16 14.2Z';

/** A glazed hearth tile with a flame over the hearthstone. */
export function LogoMark({ className, title = 'Hearth' }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label={title}>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill="#3E7A6B" />
      <path d={FLAME} fill="#E0692E" />
      <path d={CORE} fill="#F3D9B0" />
      <rect x="8" y="24" width="16" height="2.6" rx="1.3" fill="#EEF0EC" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <LogoMark className="size-7" />
      <span className="display-title text-[26px] leading-none tracking-tight">hearth</span>
    </span>
  );
}
