import type { HTMLAttributes, ReactNode } from 'react';
import { ChevronRight, LogOut, MoreHorizontal, Settings } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useRemembered } from '@/lib/storage';
import { Button } from '@/ui/Button';

/**
 * A titled group that folds away on its title, remembered on this device; a
 * long folder list can be folded to keep favorites near the top.
 */
export function Section({
  id,
  title,
  action,
  children,
}: {
  id: string;
  title: string;
  /** Beside the title, for the section's own control. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const [folded, setFolded] = useRemembered<boolean>(`sidebar.folded.${id}`, false);
  return (
    <section className="flex flex-col">
      <div className="group/section flex h-7 items-center">
        <button
          type="button"
          onClick={() => setFolded(!folded)}
          aria-expanded={!folded}
          className="flex min-w-0 flex-1 items-center gap-1 rounded-md px-1 text-left text-[12px] font-medium text-ink-3 hover:text-ink-2"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              'size-3.5 shrink-0 transition-transform motion-reduce:transition-none',
              !folded && 'rotate-90',
            )}
          />
          <span className="truncate">{title}</span>
        </button>
        {action}
      </div>
      {folded ? null : <div className="mt-0.5 flex flex-col">{children}</div>}
    </section>
  );
}

/**
 * A row. The name truncates and the full one is in its tooltip; `suffix` (a
 * favorite's parent, to tell two of the same name apart) gives way first. With `onMenu`, a ⋯ appears on hover (always
 * on touch, where there is no hover) and right-click opens the same menu.
 */
export function Item({
  icon,
  active,
  onClick,
  children,
  suffix,
  title,
  onMenu,
  rowProps,
  className,
}: {
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  suffix?: string | undefined;
  title?: string | undefined;
  onMenu?: ((x: number, y: number) => void) | undefined;
  /** Drag, drop and long-press handlers for the whole row. */
  rowProps?: HTMLAttributes<HTMLDivElement>;
  className?: string;
}) {
  return (
    <div
      {...rowProps}
      onContextMenu={
        onMenu
          ? event => {
              event.preventDefault();
              onMenu(event.clientX, event.clientY);
            }
          : undefined
      }
      className={cn('group/item relative', className)}
    >
      <button
        type="button"
        onClick={onClick}
        title={title}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:size-4 [&_svg]:shrink-0',
          // Big enough for a finger in the drawer.
          '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-[15px]',
          active && 'bg-surface font-medium text-ink shadow-sm [&_svg]:text-glaze',
          // Room for the ⋯ where it is always shown, and while it shows on hover.
          onMenu &&
            '[@media(pointer:coarse)]:pr-10 group-hover/item:pr-9 group-focus-within/item:pr-9',
        )}
      >
        {icon}
        <span className={cn('truncate', suffix ? 'max-w-full shrink-0' : 'min-w-0')}>
          {children}
        </span>
        {suffix ? (
          <span className="min-w-0 truncate text-[12px] font-normal text-ink-3">{suffix}</span>
        ) : null}
      </button>
      {onMenu ? (
        <button
          type="button"
          aria-label="More"
          onClick={event => {
            const box = event.currentTarget.getBoundingClientRect();
            onMenu(box.right, box.bottom);
          }}
          className={cn(
            'absolute inset-y-0 right-1 my-auto grid size-7 place-items-center rounded-md text-ink-3 hover:bg-line/60 hover:text-ink [&_svg]:size-4',
            'opacity-0 group-hover/item:opacity-100 focus-visible:opacity-100 [@media(pointer:coarse)]:size-9 [@media(pointer:coarse)]:opacity-100',
          )}
        >
          <MoreHorizontal />
        </button>
      ) : null}
    </div>
  );
}

/**
 * Who is signed in, settings and sign-out. When the sidebar is too narrow for
 * the name, only the initial stays, with the name in its tooltip; the buttons
 * never shrink.
 */
export function UserBar({
  username,
  onSettings,
  onSignOut,
}: {
  username: string;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-t border-line pt-3">
      <span
        title={username}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-glaze-wash text-[13px] font-semibold uppercase text-glaze-strong"
      >
        {username.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1 truncate px-1 text-[13px] @max-[13rem]:invisible">
        {username}
      </span>
      <Button size="icon" onClick={onSettings} aria-label="Settings" title="Settings">
        <Settings />
      </Button>
      <Button size="icon" onClick={onSignOut} aria-label="Sign out" title="Sign out">
        <LogOut />
      </Button>
    </div>
  );
}
