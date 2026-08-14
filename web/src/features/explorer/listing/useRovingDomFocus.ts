import { useEffect, useRef, type RefObject } from 'react';

/**
 * Keeps real DOM focus on whichever item the focus model points at.
 *
 * A roving `tabindex` is not enough: the virtualiser unmounts the focused row as
 * it scrolls out, focus falls to `<body>`, and the container's `keydown` handler
 * stops firing — arrow keys die silently. Focus is only taken when the collection
 * already had it, except on first render, which is what makes the very first
 * arrow key work without a click. The container needs `tabIndex={-1}` for that.
 */
export function useRovingDomFocus(
  container: RefObject<HTMLElement | null>,
  focusedIndex: number,
): void {
  const ownsFocus = useRef(false);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    const onFocusIn = () => {
      ownsFocus.current = true;
    };
    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && !element.contains(next)) {
        ownsFocus.current = false;
        return;
      }

      // Focus fell to nothing — usually the virtualiser unmounting the focused
      // row — so the container takes the keyboard back. Checked a frame later
      // because a dialog opening also reports no `relatedTarget` in some
      // browsers, and stealing focus out of it would be worse.
      requestAnimationFrame(() => {
        if (!ownsFocus.current) return;
        const active = document.activeElement;
        if (active === null || active === document.body) element.focus({ preventScroll: true });
      });
    };

    element.addEventListener('focusin', onFocusIn);
    element.addEventListener('focusout', onFocusOut);
    return () => {
      element.removeEventListener('focusin', onFocusIn);
      element.removeEventListener('focusout', onFocusOut);
    };
  }, [container]);

  // Claimed once, on mount, and only if nothing else owns the keyboard: a later
  // render must never yank the caret out of the search field mid-word.
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    element.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (focusedIndex < 0 || !ownsFocus.current) return;
    const element = container.current;
    if (!element) return;

    // A frame late: the virtualiser has to render the row before it can be
    // focused, and scrollToIndex only queues that work.
    const frame = requestAnimationFrame(() => {
      const target = element.querySelector<HTMLElement>(
        `[role="option"][data-index="${focusedIndex}"]`,
      );
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [container, focusedIndex]);
}
