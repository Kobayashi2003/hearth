import { createContext, use, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type Slot = 'left' | 'center' | 'right';

const DockContext = createContext<Partial<Record<Slot, HTMLElement>>>({});

/**
 * The bottom edge, shared: the mini player on the left, the selection bar in
 * the middle, uploads on the right. Stacked on a narrow screen.
 */
export function DockProvider({ children }: { children: ReactNode }) {
  const [left, setLeft] = useState<HTMLElement | null>(null);
  const [center, setCenter] = useState<HTMLElement | null>(null);
  const [right, setRight] = useState<HTMLElement | null>(null);

  return (
    <DockContext
      value={{
        ...(left ? { left } : {}),
        ...(center ? { center } : {}),
        ...(right ? { right } : {}),
      }}
    >
      {children}
      <div className="pointer-events-none fixed right-[calc(0.75rem+var(--safe-right))] bottom-[calc(0.75rem+var(--safe-bottom))] left-[calc(0.75rem+var(--safe-left))] z-40 flex flex-col-reverse items-center gap-2 lg:left-[calc(16rem+0.75rem+var(--safe-left))] lg:grid lg:grid-cols-[1fr_auto_1fr] lg:items-end">
        <div ref={setLeft} className="flex justify-start empty:hidden lg:!flex" />
        <div
          ref={setCenter}
          className="flex justify-center empty:hidden max-lg:order-first lg:!flex"
        />
        <div ref={setRight} className="flex justify-end empty:hidden lg:!flex" />
      </div>
    </DockContext>
  );
}

export function DockSlot({ slot, children }: { slot: Slot; children: ReactNode }) {
  const target = use(DockContext)[slot];
  return target ? createPortal(children, target) : null;
}

/** Room to leave at the end of a scrolling listing so the dock never covers the last row. */
export const DOCK_CLEARANCE = 96;
