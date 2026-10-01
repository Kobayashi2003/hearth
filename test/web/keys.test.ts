import { describe, expect, it, vi } from 'vitest';

import { findBinding, type KeyBinding } from '@/lib/keys';

/** Just the fields `findBinding` reads; enough to stand in for a KeyboardEvent. */
function press(
  key: string,
  modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyboardEvent {
  return {
    key,
    ctrlKey: modifiers.ctrl ?? false,
    metaKey: modifiers.meta ?? false,
    shiftKey: modifiers.shift ?? false,
    altKey: modifiers.alt ?? false,
    target: null,
  } as unknown as KeyboardEvent;
}

const run = vi.fn();

describe('findBinding', () => {
  it('takes the first binding that matches, so a modified key can come before the plain one', () => {
    const goUp: KeyBinding = { key: 'ArrowUp', alt: true, run };
    const move: KeyBinding = { key: 'ArrowUp', run };
    expect(findBinding([goUp, move], press('ArrowUp', { alt: true }))).toBe(goUp);
    expect(findBinding([goUp, move], press('ArrowUp'))).toBe(move);
  });

  it('matches letters in either case and treats ⌘ as Ctrl', () => {
    const newFolder: KeyBinding = { key: 'n', ctrl: true, shift: true, run };
    expect(findBinding([newFolder], press('N', { ctrl: true, shift: true }))).toBe(newFolder);
    expect(findBinding([newFolder], press('N', { meta: true, shift: true }))).toBe(newFolder);
    expect(findBinding([newFolder], press('n', { ctrl: true }))).toBeUndefined();
  });

  it('requires a modifier to be up when the binding says false, and ignores it when unset', () => {
    const rotate: KeyBinding = { key: 'r', ctrl: false, run };
    const anyR: KeyBinding = { key: 'r', run };
    expect(findBinding([rotate], press('r', { ctrl: true }))).toBeUndefined();
    expect(findBinding([anyR], press('r', { ctrl: true }))).toBe(anyR);
  });

  it('lets a binding that declines hand the key to the next one', () => {
    const zoomedPan: KeyBinding = { key: 'ArrowLeft', when: () => false, run };
    const previous: KeyBinding = { key: 'ArrowLeft', run };
    expect(findBinding([zoomedPan, previous], press('ArrowLeft'))).toBe(previous);
  });

  it('accepts several keys or a test', () => {
    const turn: KeyBinding = { key: ['PageDown', ' '], run };
    const typeTo: KeyBinding = { key: key => key.length === 1 && key !== ' ', run };
    expect(findBinding([turn], press(' '))).toBe(turn);
    expect(findBinding([typeTo], press('x'))).toBe(typeTo);
    expect(findBinding([typeTo], press('Enter'))).toBeUndefined();
  });
});
