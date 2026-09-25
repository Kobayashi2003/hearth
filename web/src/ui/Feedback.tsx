import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Waits 200ms before showing, so a fast load never flickers. `immediate` is for
 * a spinner answering a click, where a blank moment would look like nothing happened.
 */
export function Spinner({ className, immediate }: { className?: string; immediate?: boolean }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn(
        immediate ? 'animate-spin' : 'animate-spinner',
        'inline-block size-5 rounded-full border-2 border-current border-t-transparent opacity-60',
        className,
      )}
    />
  );
}

export function Centered({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex h-full w-full items-center justify-center', className)}>
      {children}
    </div>
  );
}

/** Empty and error states say what happened and what to do next. */
export function Notice({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col items-center justify-center gap-2 p-8 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="mb-1 text-ink-3 [&_svg]:size-9 [&_svg]:stroke-[1.4]">{icon}</div>
      ) : null}
      <p className="text-[15px] font-semibold">{title}</p>
      {body ? <p className="max-w-sm text-[13px] text-ink-2">{body}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-bg px-1 font-sans text-[11px] text-ink-3">
      {children}
    </kbd>
  );
}
