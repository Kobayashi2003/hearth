import type { LucideIcon } from 'lucide-react';

/**
 * Every action the explorer offers, declared once.
 *
 * The command palette and the keyboard-shortcuts dialog are both generated from
 * this list, so a shortcut cannot be documented but unbound, or bound but
 * undocumented. Adding an action here is all that is needed for it to appear in
 * both places.
 */
export type CommandGroup = 'Navigate' | 'View' | 'File' | 'Selection' | 'Application';

/**
 * The order the palette lists groups in: where you are, what you have picked,
 * what you can do to it, how it looks, then the application itself. Roughly the
 * order a session moves through, and a stable one — a list that reshuffles
 * between openings cannot be learned.
 */
export const GROUP_ORDER: readonly CommandGroup[] = [
  'Navigate',
  'Selection',
  'File',
  'View',
  'Application',
];

export interface Command {
  id: string;
  label: string;
  group: CommandGroup;
  icon: LucideIcon;
  /** Displayed and matched as typed, e.g. 'Ctrl+Shift+N' or 'F5'. */
  shortcut?: string;
  run: () => void;
  /** Hidden from the palette when false; the shortcut is also inert. */
  isAvailable?: boolean;
}

interface ParsedShortcut {
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

function parseShortcut(shortcut: string): ParsedShortcut {
  const parts = shortcut.toLowerCase().split('+');
  return {
    key: parts[parts.length - 1] ?? '',
    ctrl: parts.includes('ctrl'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
  };
}

/** Typing in a field must not trigger Delete or a single-letter shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

/** Find the command a key event should run, if any. */
export function matchCommand(commands: Command[], event: KeyboardEvent): Command | null {
  const pressedKey = event.key.toLowerCase();

  for (const command of commands) {
    if (!command.shortcut || command.isAvailable === false) continue;

    const binding = parseShortcut(command.shortcut);
    const keyMatches =
      binding.key === pressedKey ||
      // 'Alt+←' and friends are written with arrows for legibility.
      (binding.key === '←' && pressedKey === 'arrowleft') ||
      (binding.key === '→' && pressedKey === 'arrowright');

    if (
      keyMatches &&
      binding.ctrl === (event.ctrlKey || event.metaKey) &&
      binding.shift === event.shiftKey &&
      binding.alt === event.altKey
    ) {
      return command;
    }
  }

  return null;
}

/**
 * Rank by label, then group, for the palette's fuzzy filter.
 *
 * With nothing typed the list is not ranked at all but sorted into its groups,
 * so the palette opens as an ordered menu of everything available rather than as
 * a heap in registration order.
 */
export function filterCommands(commands: Command[], term: string): Command[] {
  const available = commands.filter(command => command.isAvailable !== false);
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return [...available].sort(
      (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group),
    );
  }

  return available
    .map(command => ({
      command,
      score: score(`${command.label} ${command.group}`.toLowerCase(), needle),
    }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(candidate => candidate.command);
}

/** A prefix match beats a word-start match, which beats a loose substring. */
function score(haystack: string, needle: string): number {
  if (haystack.startsWith(needle)) return 3;
  if (haystack.includes(` ${needle}`)) return 2;
  return haystack.includes(needle) ? 1 : 0;
}
