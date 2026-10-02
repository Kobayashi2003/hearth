// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@hearth/shared';

import { useEntryEvents } from '@/features/explorer/entryEvents';
import { useSelection } from '@/features/explorer/useSelection';

const file = (name: string): FileEntry => ({
  name,
  path: `dir/${name}`,
  size: 1,
  mtime: '2026-01-01T00:00:00.000Z',
  mimeType: 'text/plain',
  isDirectory: false,
});

const entries = ['apple', 'banana', 'cherry', 'avocado', 'date'].map(file);
const path = (name: string) => `dir/${name}`;

function render() {
  return renderHook(() => useSelection(entries));
}

const selectedNames = (selected: ReadonlySet<string>) =>
  [...selected].map(item => item.replace('dir/', '')).sort();

describe('useSelection', () => {
  it('replaces on a plain click, toggles with Ctrl and extends from the anchor with Shift', () => {
    const { result } = render();
    act(() => result.current.pick(path('banana')));
    expect(selectedNames(result.current.selected)).toEqual(['banana']);

    act(() => result.current.pick(path('date'), { ctrl: true }));
    expect(selectedNames(result.current.selected)).toEqual(['banana', 'date']);

    act(() => result.current.pick(path('date'), { ctrl: true }));
    expect(selectedNames(result.current.selected)).toEqual(['banana']);

    act(() => result.current.pick(path('banana')));
    act(() => result.current.pick(path('avocado'), { shift: true }));
    expect(selectedNames(result.current.selected)).toEqual(['avocado', 'banana', 'cherry']);
  });

  it('moves the anchor to the last item clicked with Ctrl, as file managers do', () => {
    const { result } = render();
    act(() => result.current.pick(path('apple')));
    act(() => result.current.pick(path('date'), { ctrl: true }));
    act(() => result.current.pick(path('cherry'), { shift: true }));
    expect(selectedNames(result.current.selected)).toEqual(['avocado', 'cherry', 'date']);
  });

  it('shows the focus ring only after keyboard use', () => {
    const { result } = render();
    act(() => result.current.pick(path('apple')));
    expect(result.current.focusVisible).toBe(false);

    act(() => result.current.move(1));
    expect(result.current.focusVisible).toBe(true);
    expect(selectedNames(result.current.selected)).toEqual(['banana']);

    act(() => result.current.pick(path('cherry')));
    expect(result.current.focusVisible).toBe(false);
  });

  it('extends with Shift + arrows and moves only the focus with Ctrl + arrows', () => {
    const { result } = render();
    act(() => result.current.move(1));
    act(() => result.current.move(1, { shift: true }));
    expect(selectedNames(result.current.selected)).toEqual(['apple', 'banana']);

    act(() => result.current.move(1, { ctrl: true }));
    expect(result.current.focused).toBe(path('cherry'));
    expect(selectedNames(result.current.selected)).toEqual(['apple', 'banana']);

    act(() => result.current.toggleFocused());
    expect(selectedNames(result.current.selected)).toEqual(['apple', 'banana', 'cherry']);
  });

  it('stops at either end of the list', () => {
    const { result } = render();
    act(() => result.current.move('end'));
    act(() => result.current.move(5));
    expect(result.current.focused).toBe(path('date'));
    act(() => result.current.move(-99));
    expect(result.current.focused).toBe(path('apple'));
  });

  it('cycles through names sharing a first letter when the letter is typed again', () => {
    const { result } = render();
    act(() => result.current.typeTo('a'));
    expect(result.current.focused).toBe(path('apple'));
    act(() => result.current.typeTo('a'));
    expect(result.current.focused).toBe(path('avocado'));
  });

  it('lands on a revealed item selected and in view', () => {
    const { result } = render();
    act(() => result.current.reveal(path('cherry')));
    expect(selectedNames(result.current.selected)).toEqual(['cherry']);
    expect(result.current.focusedIndex).toBe(2);
    expect(result.current.focusVisible).toBe(true);
  });

  it('selects all, inverts, and clears', () => {
    const { result } = render();
    act(() => result.current.pick(path('apple')));
    act(() => result.current.invert());
    expect(selectedNames(result.current.selected)).toEqual(['avocado', 'banana', 'cherry', 'date']);
    act(() => result.current.selectAll());
    expect(result.current.selected.size).toBe(5);
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });
});

describe('useEntryEvents', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function setup(onlySelected: boolean) {
    const handlers = {
      onPick: vi.fn(),
      onOpen: vi.fn(),
      onMenu: vi.fn(),
      onDeselect: vi.fn(),
      isOnlySelected: () => onlySelected,
      isSelecting: onlySelected,
    };
    const { result } = renderHook(() => useEntryEvents(handlers));
    const events = result.current(entries[0]!);
    const mouse = { button: 0, pointerType: 'mouse', clientX: 0, clientY: 0 };
    const click = (detail: number, extra: object = {}) => {
      events.onPointerDown(mouse as never);
      events.onClick({
        detail,
        ctrlKey: false,
        metaKey: false,
        shiftKey: false,
        ...extra,
      } as never);
    };
    return { handlers, events, click };
  }

  it('picks an unselected item at once', () => {
    const { handlers, click } = setup(false);
    click(1);
    expect(handlers.onPick).toHaveBeenCalledWith(entries[0], { ctrl: false, shift: false });
  });

  it('deselects the only selected item, but only once a double-click is ruled out', () => {
    const { handlers, click } = setup(true);
    click(1);
    expect(handlers.onDeselect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(handlers.onDeselect).toHaveBeenCalledTimes(1);
  });

  it('keeps a double-clicked selected item selected and opens it', () => {
    const { handlers, events, click } = setup(true);
    click(1);
    click(2);
    events.onDoubleClick({ preventDefault() {} } as never);
    vi.advanceTimersByTime(1000);
    expect(handlers.onDeselect).not.toHaveBeenCalled();
    expect(handlers.onOpen).toHaveBeenCalledWith(entries[0]);
  });

  it('toggles with Ctrl even on the only selected item', () => {
    const { handlers, click } = setup(true);
    click(1, { ctrlKey: true });
    expect(handlers.onPick).toHaveBeenCalledWith(entries[0], { ctrl: true, shift: false });
    vi.advanceTimersByTime(300);
    expect(handlers.onDeselect).not.toHaveBeenCalled();
  });

  it('marks every item so the page can tell items from empty space', () => {
    const { events } = setup(false);
    expect(events['data-entry']).toBe('');
  });
});
