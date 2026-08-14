import { useSyncExternalStore } from 'react';

/**
 * The width axis: what the layout can hold.
 *
 * Deliberately *not* about devices. A phone in landscape is 844px wide and
 * belongs in `medium`; a desktop window dragged narrow belongs there too. What
 * the hands can do is a separate question — see `useInputCapability`.
 *
 * Cut at 768 and 1024, which are Tailwind's `md` and `lg`, so no custom
 * breakpoints enter the design system. The upper cut is 1024 rather than 1280
 * because an iPad in landscape is 1180px and that is the posture that most
 * wants the folder tree. See ADR 0002.
 */
export type Breakpoint = 'narrow' | 'medium' | 'wide';

export const BREAKPOINTS = { medium: 768, wide: 1024 } as const;

const QUERIES: ReadonlyArray<[Breakpoint, string]> = [
  ['wide', `(min-width: ${BREAKPOINTS.wide}px)`],
  ['medium', `(min-width: ${BREAKPOINTS.medium}px)`],
];

function currentBreakpoint(): Breakpoint {
  for (const [name, query] of QUERIES) {
    if (window.matchMedia(query).matches) return name;
  }
  return 'narrow';
}

function subscribe(onChange: () => void): () => void {
  const lists = QUERIES.map(([, query]) => window.matchMedia(query));
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

export function useBreakpoint(): Breakpoint {
  // `useSyncExternalStore` rather than an effect: the first paint gets the real
  // value, so a wide layout never flashes through its narrow form on load.
  return useSyncExternalStore(subscribe, currentBreakpoint, () => 'wide' as const);
}

/** `at('medium')` is true at medium *and* wide — the usual "this size or bigger". */
export function useAtLeast(minimum: Breakpoint): boolean {
  const current = useBreakpoint();
  const order: Breakpoint[] = ['narrow', 'medium', 'wide'];
  return order.indexOf(current) >= order.indexOf(minimum);
}
