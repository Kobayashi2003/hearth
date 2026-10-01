import type { FileEntry } from '@hearth/shared';

import type { KeyBinding } from '@/lib/keys';
import type { ActionHandlers } from './actions';
import type { Explorer } from './useExplorer';
import type { FileOperations } from './useFileOperations';
import type { Selection } from './useSelection';

const PAGE_ROWS = 10;

export interface ShortcutContext {
  explorer: Explorer;
  selection: Selection;
  operations: FileOperations;
  handlers: ActionHandlers;
  entries: readonly FileEntry[];
  /** Items per row: arrow up and down move this far. */
  step: number;
  isGrid: boolean;
  canWrite: boolean;
  canDelete: boolean;
  /** A preview, dialog, menu or palette is open and owns the keyboard. */
  blocked: boolean;
  openPalette: () => void;
  newFolder: () => void;
  upload: () => void;
  focusSearch: () => void;
}

/** Radix menus and dialogs portal out of the page; while one is open the keys are its. */
const overlayOpen = () =>
  document.querySelector('[role="dialog"], [data-radix-popper-content-wrapper]') !== null;

/** The explorer's keyboard, first match wins. Ctrl + K is the only key that works everywhere. */
export function explorerShortcuts(context: ShortcutContext): KeyBinding[] {
  const { explorer, selection, operations, handlers, step, isGrid, canWrite, canDelete } = context;
  const free = () => !context.blocked && !overlayOpen();
  const selected = () => selection.selectedEntries;
  const focused = () => context.entries[selection.focusedIndex];
  const modifiers = (event: KeyboardEvent) => ({
    shift: event.shiftKey,
    ctrl: event.ctrlKey || event.metaKey,
  });
  const move = (delta: number | 'start' | 'end') => (event: KeyboardEvent) =>
    selection.move(delta, modifiers(event));

  const bindings: KeyBinding[] = [
    { key: 'k', ctrl: true, inFields: true, run: context.openPalette },
    { key: 'ArrowUp', alt: true, run: explorer.goUp },
    { key: 'ArrowDown', run: move(step) },
    { key: 'ArrowUp', run: move(-step) },
    { key: 'ArrowRight', when: isGrid, run: move(1) },
    { key: 'ArrowLeft', when: isGrid, run: move(-1) },
    { key: 'PageDown', run: move(PAGE_ROWS * step) },
    { key: 'PageUp', run: move(-PAGE_ROWS * step) },
    { key: 'Home', run: move('start') },
    { key: 'End', run: move('end') },
    {
      key: 'Enter',
      alt: true,
      when: () => focused() !== undefined,
      run: () => handlers.details(focused()!),
    },
    { key: 'Enter', when: () => focused() !== undefined, run: () => handlers.open(focused()!) },
    { key: 'Backspace', run: explorer.goUp },
    {
      key: 'Escape',
      when: () => selected().length > 0 || operations.clipboard !== null,
      run: () => (selected().length > 0 ? selection.clear() : operations.clearClipboard()),
    },
    { key: ' ', when: () => focused() !== undefined, run: selection.toggleFocused },
    { key: 'F5', run: () => void explorer.refetch() },
    { key: '/', run: context.focusSearch },
    { key: 'f', ctrl: true, run: context.focusSearch },
    { key: 'a', ctrl: true, run: selection.selectAll },
    {
      key: 'c',
      ctrl: true,
      when: () => canWrite && selected().length > 0,
      run: () => operations.copy(selected()),
    },
    {
      key: 'x',
      ctrl: true,
      when: () => canWrite && selected().length > 0,
      run: () => operations.cut(selected()),
    },
    {
      key: 'v',
      ctrl: true,
      when: () => canWrite && operations.clipboard !== null,
      run: operations.paste,
    },
    { key: 'n', ctrl: true, shift: true, when: canWrite, run: context.newFolder },
    { key: 'u', ctrl: true, when: canWrite, run: context.upload },
    {
      key: 'Delete',
      when: () => canDelete && selected().length > 0,
      run: () => handlers.remove(selected()),
    },
    {
      key: 'F2',
      when: () => canWrite && selected().length === 1,
      run: () => handlers.rename(selected()[0]!),
    },
    // Anything else printable jumps to the first name starting with it.
    {
      key: key => key.length === 1 && key !== ' ',
      ctrl: false,
      alt: false,
      run: event => selection.typeTo(event.key),
    },
  ];

  // Every key but the palette waits for the explorer to have the keyboard.
  return bindings.map((binding, index) =>
    index === 0
      ? binding
      : {
          ...binding,
          when: () =>
            free() &&
            (typeof binding.when === 'function' ? binding.when() : (binding.when ?? true)),
        },
  );
}
