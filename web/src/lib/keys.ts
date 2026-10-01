import { useEffect, useRef } from 'react';

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    typeof HTMLElement !== 'undefined' &&
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export interface KeyBinding {
  /** `event.key` (letters match either case), several of them, or a test. */
  key: string | readonly string[] | ((key: string) => boolean);
  /** true: Ctrl or ⌘ must be held; false: must not be; omitted: either. */
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** Read when the key arrives; a binding that says no lets the next one try. */
  when?: boolean | (() => boolean);
  /** Also fire while typing in a field (a palette shortcut, say). */
  inFields?: boolean;
  run: (event: KeyboardEvent) => void;
}

const fold = (key: string) => (key.length === 1 ? key.toLowerCase() : key);

function keyMatches(pattern: KeyBinding['key'], key: string): boolean {
  if (typeof pattern === 'function') return pattern(key);
  const keys: readonly string[] = typeof pattern === 'string' ? [pattern] : pattern;
  return keys.some(candidate => fold(candidate) === fold(key));
}

function modifierMatches(required: boolean | undefined, held: boolean): boolean {
  return required === undefined || required === held;
}

export function findBinding(
  bindings: readonly KeyBinding[],
  event: KeyboardEvent,
): KeyBinding | undefined {
  const typing = isTypingTarget(event.target);
  return bindings.find(
    binding =>
      (!typing || binding.inFields) &&
      keyMatches(binding.key, event.key) &&
      modifierMatches(binding.ctrl, event.ctrlKey || event.metaKey) &&
      modifierMatches(binding.shift, event.shiftKey) &&
      modifierMatches(binding.alt, event.altKey) &&
      (typeof binding.when === 'function' ? binding.when() : (binding.when ?? true)),
  );
}

/**
 * Window-level shortcuts as a table: the first binding that matches runs and
 * the key is consumed. The table is read when a key arrives, so bindings can
 * close over the latest state without re-subscribing. A key some other handler
 * already took (`defaultPrevented`) is left alone.
 */
export function useKeyBindings(
  bindings: readonly KeyBinding[],
  { capture = false }: { capture?: boolean } = {},
): void {
  const latest = useRef(bindings);
  latest.current = bindings;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return;
      const binding = findBinding(latest.current, event);
      if (!binding) return;
      event.preventDefault();
      binding.run(event);
    }
    window.addEventListener('keydown', onKeyDown, capture);
    return () => window.removeEventListener('keydown', onKeyDown, capture);
  }, [capture]);
}
