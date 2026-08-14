import { useCallback, useRef, useState } from 'react';

/**
 * Focus and Selection as two separate states, with Windows Explorer's keyboard
 * semantics — the muscle memory this product's users already have.
 *
 *   ↑ ↓        move focus, and select what you land on
 *   ← →        same, one step within a grid row
 *   Ctrl+↑↓    move focus without disturbing the selection
 *   Space      toggle the focused item
 *   Shift+↑↓   extend from the anchor
 *   Home/End   first / last
 *   PageUp/Dn  one visible page
 *   A–Z        jump to the next item starting with that letter
 *   Enter      open the focused item
 *
 * Keeping the two apart is what makes discontiguous selection possible: you
 * cannot select items 1, 4 and 7 from the keyboard if moving always selects.
 */

export interface FocusModelOptions {
  count: number;
  /** Columns in the current layout — 1 for a list, measured for a grid. */
  columns: number;
  /** Rows visible at once, for PageUp / PageDown. */
  pageRows: number;
  /** First letter of each item, lowercased, for type-ahead. */
  initials: () => string[];
  onOpen: (index: number) => void;
}

/** Two keystrokes closer together than this continue the same type-ahead search. */
export const TYPEAHEAD_RESET_MS = 800;

/**
 * The next item matching `term`, searching forward from `from` and wrapping.
 *
 * Repeating one letter cycles through the items starting with it rather than
 * searching for a doubled letter, which is what every file manager does and
 * what fingers expect when hunting for the third file beginning with "s".
 *
 * Pure and exported so the wrap-around and the cycling rule can be tested
 * without mounting a component.
 */
export function findByInitial(initials: string[], term: string, from: number): number | null {
  const count = initials.length;
  if (count === 0 || term.length === 0) return null;

  const needle = term.length > 1 && new Set(term).size === 1 ? term.charAt(0) : term;
  const start = from < 0 ? 0 : from + 1;

  for (let step = 0; step < count; step += 1) {
    const index = (start + step) % count;
    if (initials[index]?.startsWith(needle)) return index;
  }
  return null;
}

/** Grow or restart the type-ahead term depending on how long the pause was. */
export function nextTypeaheadTerm(
  previous: { term: string; at: number },
  character: string,
  now: number,
): string {
  return now - previous.at > TYPEAHEAD_RESET_MS ? character : previous.term + character;
}

export function useFocusModel({
  count,
  columns,
  pageRows,
  initials,
  onOpen,
}: FocusModelOptions) {
  const [focused, setFocused] = useState(-1);
  const [selected, setSelected] = useState<ReadonlySet<number>>(new Set());
  const anchor = useRef(-1);
  const typeahead = useRef({ term: '', at: 0 });

  const clamp = useCallback((index: number) => Math.max(0, Math.min(count - 1, index)), [count]);

  const rangeFrom = useCallback(
    (from: number, to: number) => {
      const [low, high] = from <= to ? [from, to] : [to, from];
      const range = new Set<number>();
      for (let index = low; index <= high; index += 1) range.add(index);
      return range;
    },
    [],
  );

  /** Move focus, and decide what that does to the selection. */
  const moveTo = useCallback(
    (target: number, mode: 'replace' | 'extend' | 'focus-only') => {
      const next = clamp(target);
      setFocused(next);

      if (mode === 'focus-only') return next;
      if (mode === 'extend') {
        if (anchor.current < 0) anchor.current = next;
        setSelected(rangeFrom(anchor.current, next));
        return next;
      }

      anchor.current = next;
      setSelected(new Set([next]));
      return next;
    },
    [clamp, rangeFrom],
  );

  const toggle = useCallback((index: number) => {
    setSelected(current => {
      const next = new Set(current);
      if (!next.delete(index)) next.add(index);
      return next;
    });
    anchor.current = index;
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(Array.from({ length: count }, (_, index) => index)));
  }, [count]);

  const invert = useCallback(() => {
    setSelected(current => {
      const next = new Set<number>();
      for (let index = 0; index < count; index += 1) {
        if (!current.has(index)) next.add(index);
      }
      return next;
    });
  }, [count]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchor.current = -1;
  }, []);

  /** Jump to the next item beginning with the typed letters, wrapping around. */
  const jumpTo = useCallback(
    (character: string) => {
      const now = Date.now();
      const state = typeahead.current;
      state.term = nextTypeaheadTerm(state, character, now);
      state.at = now;

      const found = findByInitial(initials(), state.term, focused);
      if (found === null) return null;
      moveTo(found, 'replace');
      return found;
    },
    [focused, initials, moveTo],
  );

  /**
   * Returns the index that should be scrolled into view, or null when the key
   * was not ours. The caller owns scrolling because only it knows about the
   * virtualiser.
   */
  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent | KeyboardEvent): number | null => {
      if (count === 0) return null;

      const control = event.ctrlKey || event.metaKey;
      const from = focused < 0 ? 0 : focused;
      const step = (delta: number) =>
        moveTo(focused < 0 ? 0 : from + delta, control ? 'focus-only' : event.shiftKey ? 'extend' : 'replace');

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          return step(columns);
        case 'ArrowUp':
          event.preventDefault();
          return step(-columns);
        case 'ArrowRight':
          if (columns === 1) return null; // In a list, ← → belong to the caller.
          event.preventDefault();
          return step(1);
        case 'ArrowLeft':
          if (columns === 1) return null;
          event.preventDefault();
          return step(-1);
        case 'PageDown':
          event.preventDefault();
          return step(columns * pageRows);
        case 'PageUp':
          event.preventDefault();
          return step(-columns * pageRows);
        case 'Home':
          if (event.altKey) return null; // Alt+Home navigates to the root folder.
          event.preventDefault();
          return moveTo(0, event.shiftKey ? 'extend' : 'replace');
        case 'End':
          event.preventDefault();
          return moveTo(count - 1, event.shiftKey ? 'extend' : 'replace');
        case ' ':
          if (focused < 0) return null;
          event.preventDefault();
          toggle(focused);
          return focused;
        case 'Enter':
          if (focused < 0 || event.repeat) return null;
          event.preventDefault();
          onOpen(focused);
          return focused;
        default:
          break;
      }

      // Type-ahead last, so it never shadows a modifier combination.
      if (event.key.length === 1 && !control && !event.altKey && /\S/.test(event.key)) {
        event.preventDefault();
        return jumpTo(event.key.toLowerCase());
      }
      return null;
    },
    [columns, count, focused, jumpTo, moveTo, onOpen, pageRows, toggle],
  );

  /** Pointer selection, sharing the anchor so Shift+click and Shift+↓ agree. */
  const selectAt = useCallback(
    (index: number, modifiers: { ctrl?: boolean; shift?: boolean } = {}) => {
      setFocused(index);
      if (modifiers.shift && anchor.current >= 0) {
        const range = rangeFrom(anchor.current, index);
        setSelected(current => (modifiers.ctrl ? new Set([...current, ...range]) : range));
        return;
      }
      if (modifiers.ctrl) {
        toggle(index);
        return;
      }
      anchor.current = index;
      setSelected(current =>
        current.size === 1 && current.has(index) ? new Set() : new Set([index]),
      );
    },
    [rangeFrom, toggle],
  );

  return {
    focused,
    selected,
    /** Roving tabindex: exactly one item in the collection is tabbable. */
    tabIndexFor: (index: number) => (index === Math.max(focused, 0) ? 0 : -1),
    handleKeyDown,
    selectAt,
    setFocused,
    toggle,
    selectAll,
    invert,
    clear,
  };
}
