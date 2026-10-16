import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import type { SidebarLayout } from './useSidebarLayout';

/**
 * The sidebar docked beside the content. Its contents keep the full width
 * while it opens or closes and are clipped, so nothing reflows mid-animation.
 * The handle straddles the edge, outside the clip and above the content, so
 * it is as easy to hit from either side; it drags the width, takes the arrow
 * keys, and resets on a double-click. Dragged far enough left it puts the
 * sidebar away.
 */
export function DockedSidebar({
  layout,
  children,
}: {
  layout: SidebarLayout;
  children: ReactNode;
}) {
  const open = layout.mode === 'docked';
  return (
    <aside
      className={cn(
        'relative z-20 shrink-0 border-line',
        open && 'border-r',
        !layout.resizing &&
          'transition-[width] duration-200 ease-out motion-reduce:transition-none',
      )}
      style={{ width: open ? layout.width : 0 }}
    >
      <div aria-hidden={!open} inert={!open} className="h-full overflow-hidden">
        <div className="@container h-full" style={{ width: layout.width }}>
          {children}
        </div>
      </div>
      <ResizeHandle layout={layout} />
    </aside>
  );
}

function ResizeHandle({ layout }: { layout: SidebarLayout }) {
  const { resizer } = layout;
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Sidebar width"
      aria-valuemin={resizer.min}
      aria-valuemax={resizer.max}
      aria-valuenow={layout.width}
      tabIndex={layout.mode === 'docked' ? 0 : -1}
      title="Drag to resize, double-click to reset"
      {...resizer}
      className={cn(
        'group/handle absolute inset-y-0 -right-1.5 z-20 w-3 cursor-col-resize touch-none select-none outline-none',
        // Captured by the pointer while it drags, so the handle stays under it even put away.
        layout.mode !== 'docked' && !layout.resizing && 'hidden',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-glaze opacity-0 transition-opacity delay-150',
          'group-hover/handle:opacity-60 group-focus-visible/handle:opacity-100',
          layout.resizing && 'opacity-100 delay-0',
          layout.puttingAway && 'bg-ink-3',
        )}
      />
    </div>
  );
}

/** The sidebar as a drawer over the content, on screens that cannot spare it the room. */
export function DrawerSidebar({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-fade-out" />
        <RadixDialog.Content className="@container fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] bg-bg pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] shadow-float outline-none animate-slide-in data-[state=closed]:animate-slide-out">
          <RadixDialog.Title className="sr-only">Places</RadixDialog.Title>
          <RadixDialog.Description className="sr-only">
            Favorites, folders and collections
          </RadixDialog.Description>
          {children}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
