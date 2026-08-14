import { useSyncExternalStore } from 'react';

/**
 * The input axis: what the hands can do.
 *
 * Separate from width because the two genuinely disagree — a phone in landscape
 * is wide and touched, a narrow desktop window is small and moused, an iPad
 * with a keyboard is both. Branching layout on width and ergonomics on input is
 * the whole of ADR 0002.
 */

export interface InputCapability {
  /** True when the primary pointer is a finger. Sets the hit-area floor. */
  coarse: boolean;
  /**
   * True when hover is a real, sustainable state — not an emulated tap.
   *
   * Also the signal for whether to render shortcut labels: hover is a better
   * proxy for "there is a keyboard" than pointer is, because a laptop with a
   * touchscreen reports a coarse *primary* pointer on some platforms while
   * still having a keyboard sitting under it.
   */
  hover: boolean;
}

const COARSE = '(pointer: coarse)';
const HOVER = '(hover: hover)';

function read(): InputCapability {
  return { coarse: window.matchMedia(COARSE).matches, hover: window.matchMedia(HOVER).matches };
}

/**
 * Cached because `useSyncExternalStore` compares snapshots by identity, and a
 * fresh object every call would loop forever.
 */
let snapshot: InputCapability | null = null;

function getSnapshot(): InputCapability {
  const next = read();
  if (!snapshot || snapshot.coarse !== next.coarse || snapshot.hover !== next.hover) {
    snapshot = next;
  }
  return snapshot;
}

const SERVER_DEFAULT: InputCapability = { coarse: false, hover: true };

function subscribe(onChange: () => void): () => void {
  const lists = [window.matchMedia(COARSE), window.matchMedia(HOVER)];
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

export function useInputCapability(): InputCapability {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_DEFAULT);
}
