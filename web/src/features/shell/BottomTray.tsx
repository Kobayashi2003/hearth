import {
  createContext,
  Fragment,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/cn';

/**
 * The bottom tray: one surface for what Hearth is doing and what you can do
 * about it.
 *
 * "This album is playing" and "these files are selected" answer the same
 * question, so they are sections of one pill rather than two that collide.
 * Sections open and close along the tray's axis with `0fr`/`1fr`, which animates
 * exactly without a guessed width.
 */

/** Left to right on a roomy screen, top to bottom on a narrow one. */
export type TraySlot = 'dock' | 'selection';

const SLOT_ORDER: readonly TraySlot[] = ['dock', 'selection'];

/** Matches `--duration-quick`: content outlives its state by exactly one collapse. */
const EXIT_MS = 180;

/**
 * The offset the tray floats at, plus as much again beneath the content above
 * it — so the last row of a listing clears the tray rather than tucking under.
 */
const CLEARANCE_PX = 24;

interface TrayValue {
  slots: Partial<Record<TraySlot, HTMLElement>>;
  /** Which sections still have something in the document, exit included. */
  rendered: Partial<Record<TraySlot, boolean>>;
  /** True while more than one section is in the tray — see `useTrayIsShared`. */
  isShared: boolean;
  setOpen: (slot: TraySlot, open: boolean) => void;
  /** Height of the tray plus clearance; 0 when it is empty. */
  inset: number;
  remeasure: () => void;
}

const TrayContext = createContext<TrayValue | null>(null);

export function BottomTrayProvider({ children }: { children: ReactNode }) {
  // One state per slot, so each `ref` is a setter React can keep: a callback
  // built during render is re-attached every time, which loops if it writes state.
  const [dockSlot, setDockSlot] = useState<HTMLElement | null>(null);
  const [selectionSlot, setSelectionSlot] = useState<HTMLElement | null>(null);

  const [open, setOpenState] = useState<Partial<Record<TraySlot, boolean>>>({});
  const [rendered, setRendered] = useState<Partial<Record<TraySlot, boolean>>>({});
  const exits = useRef<Partial<Record<TraySlot, ReturnType<typeof setTimeout>>>>({});

  const setOpen = useCallback((slot: TraySlot, next: boolean) => {
    setOpenState(current => (current[slot] === next ? current : { ...current, [slot]: next }));

    clearTimeout(exits.current[slot]);
    if (next) {
      setRendered(current => (current[slot] ? current : { ...current, [slot]: true }));
    } else {
      // Held on screen for the length of the collapse, then let go.
      exits.current[slot] = setTimeout(
        () => setRendered(current => ({ ...current, [slot]: false })),
        EXIT_MS,
      );
    }
  }, []);

  useEffect(() => {
    const timers = exits.current;
    return () => {
      for (const timer of Object.values(timers)) clearTimeout(timer);
    };
  }, []);

  const [pill, setPill] = useState<HTMLDivElement | null>(null);
  const pillRef = useRef<HTMLDivElement | null>(null);
  const [inset, setInset] = useState(0);

  // Measured, and called directly by a bar rather than left to the observer: a
  // `ResizeObserver` reports only during a rendering frame, so a background tab
  // would come back with a stale inset.
  const measure = useCallback(() => {
    const element = pillRef.current;
    const height = element ? element.getBoundingClientRect().height : 0;
    setInset(current => {
      const next = height > 0 ? Math.round(height) + CLEARANCE_PX : 0;
      return next === current ? current : next;
    });
  }, []);

  const attachPill = useCallback((element: HTMLDivElement | null) => {
    pillRef.current = element;
    setPill(element);
  }, []);

  // The observer covers what the bars cannot: the tray moving through an
  // animation, and a bar that rewraps when the window narrows.
  useLayoutEffect(() => {
    if (!pill) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(pill);
    return () => observer.disconnect();
  }, [pill, measure]);

  const occupied = SLOT_ORDER.filter(slot => rendered[slot]);
  const isShared = occupied.length > 1;

  const value = useMemo<TrayValue>(
    () => ({
      slots: {
        ...(dockSlot ? { dock: dockSlot } : {}),
        ...(selectionSlot ? { selection: selectionSlot } : {}),
      },
      rendered,
      isShared,
      setOpen,
      inset,
      remeasure: measure,
    }),
    [dockSlot, selectionSlot, rendered, isShared, setOpen, inset, measure],
  );

  const attach: Record<TraySlot, (element: HTMLElement | null) => void> = {
    dock: setDockSlot,
    selection: setSelectionSlot,
  };

  return (
    <TrayContext value={value}>
      {children}

      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-40 flex justify-center px-3">
        {/* The surface belongs to the tray, not to the bars in it. Hidden when
            empty, so an empty tray is nothing rather than a sliver of border. */}
        <div
          ref={attachPill}
          className={cn(
            'pointer-events-auto flex max-w-full overflow-hidden rounded-xl border border-subtle',
            'bg-overlay/95 shadow-lg backdrop-blur-md',
            // Narrow: a column of sections centred on the tray's axis, each as
            // wide as its own contents. Roomy: one row.
            'flex-col items-center sm:flex-row sm:items-center',
            occupied.length === 0 && 'hidden',
          )}
        >
          {SLOT_ORDER.map((slot, index) => (
            <Fragment key={slot}>
              {index > 0 && occupied.length > 1 ? (
                <div
                  aria-hidden
                  className="h-px w-full shrink-0 self-stretch bg-[var(--border-subtle)] sm:h-8 sm:w-px"
                />
              ) : null}

              <div
                data-state={open[slot] ? 'open' : 'closed'}
                className={cn(
                  'grid min-w-0',
                  'motion-safe:transition-[grid-template-rows,grid-template-columns,opacity]',
                  'duration-[var(--duration-quick)] ease-[var(--ease-out-quick)]',
                  // A column below `sm` opens downwards; a row opens sideways.
                  '[grid-template-rows:1fr] data-[state=closed]:[grid-template-rows:0fr]',
                  'sm:[grid-template-rows:1fr] sm:data-[state=closed]:[grid-template-rows:1fr]',
                  'sm:[grid-template-columns:1fr] sm:data-[state=closed]:[grid-template-columns:0fr]',
                  'data-[state=closed]:opacity-0',
                )}
              >
                <div ref={attach[slot]} className="min-h-0 min-w-0 overflow-hidden" />
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </TrayContext>
  );
}

function useTray(): TrayValue {
  const value = use(TrayContext);
  if (!value) throw new Error('The bottom tray is only available inside AppShell');
  return value;
}

/** Put a section in the tray. `show` animates it: a section must still be
 *  rendered to be seen leaving. */
export function TrayBar({
  slot,
  show,
  children,
}: {
  slot: TraySlot;
  show: boolean;
  children: ReactNode;
}) {
  const { slots, rendered, setOpen, remeasure } = useTray();

  useLayoutEffect(() => {
    setOpen(slot, show);
  }, [slot, show, setOpen]);

  // Leaving the tree entirely is the same as being told to close.
  useLayoutEffect(() => () => setOpen(slot, false), [slot, setOpen]);

  // The departure is measured a microtask later: a layout cleanup runs while the
  // section is still in the document.
  useLayoutEffect(() => {
    remeasure();
    return () => queueMicrotask(remeasure);
  });

  // A closing section's own state is already gone, so it leaves saying what it
  // last said rather than flashing "0 selected" through the exit.
  const parting = useRef<ReactNode>(children);
  if (show) parting.current = children;

  const target = slots[slot];
  if (!target || !rendered[slot]) return null;
  return createPortal(show ? children : parting.current, target);
}

/** How much room content should leave at its end so the tray does not cover it. */
export function useTrayInset(): number {
  return useTray().inset;
}

/**
 * True when this section is not alone in the tray. Only the tray knows there is a
 * shortage; each section decides what to give up, and drops its title first.
 */
export function useTrayIsShared(): boolean {
  return useTray().isShared;
}
