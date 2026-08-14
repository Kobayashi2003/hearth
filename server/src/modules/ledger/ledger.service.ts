import fsp from 'node:fs/promises';
import path from 'node:path';

import { EMPTY_LEDGER, type LedgerDocument, type LedgerPatch } from '@hearth/shared';

import { JsonDocument } from '../../lib/json-store.js';

/**
 * Ledger — the household account of where each person was.
 *
 * One document per user, keyed by root-relative path. Paths are not stable
 * identities, so `reprefix` is called whenever Hearth itself moves something;
 * see ADR 0001 for why a content hash was rejected.
 */

/** Enough history to find last week's book; small enough to stay a readable file. */
const RECENT_LIMIT = 200;
const PROGRESS_LIMIT = 500;

export class LedgerService {
  private readonly documents = new Map<string, JsonDocument<LedgerDocument>>();

  constructor(private readonly directory: string) {}

  read(username: string): LedgerDocument {
    return this.documentFor(username).read();
  }

  async patch(username: string, patch: LedgerPatch): Promise<LedgerDocument> {
    return this.documentFor(username).update(current => applyPatch(current, patch));
  }

  /**
   * Follow a move. Applied to *every* user's ledger, not just the one who made
   * the move — the file moved for everyone who had a position in it.
   *
   * `from` and `to` may be files or directories; a directory rename rewrites
   * every path beneath it.
   */
  async reprefix(from: string, to: string): Promise<void> {
    if (from === to) return;
    await this.rewriteAll(key => (matchesPrefix(key, from) ? to + key.slice(from.length) : key));
  }

  /** Drop everything under a path that no longer exists. */
  async forget(target: string): Promise<void> {
    await this.rewriteAll(key => (matchesPrefix(key, target) ? null : key));
  }

  /**
   * Apply a path rewrite across all users. Returning null from `rewrite` drops
   * the entry. Errors on one user's file must not abandon the rest, so each is
   * attempted independently.
   */
  private async rewriteAll(rewrite: (path: string) => string | null): Promise<void> {
    for (const username of await this.knownUsers()) {
      try {
        await this.documentFor(username).update(current => remap(current, rewrite));
      } catch {
        // A ledger is a convenience, never a source of truth for the filesystem
        // operation that triggered this. Losing one user's positions must not
        // fail the rename that succeeded on disk.
      }
    }
  }

  private async knownUsers(): Promise<string[]> {
    let names: string[];
    try {
      names = await fsp.readdir(this.directory);
    } catch {
      return [];
    }
    return names.filter(name => name.endsWith('.json')).map(name => decodeName(name.slice(0, -5)));
  }

  private documentFor(username: string): JsonDocument<LedgerDocument> {
    let document = this.documents.get(username);
    if (!document) {
      document = new JsonDocument<LedgerDocument>(
        path.join(this.directory, `${encodeName(username)}.json`),
        () => structuredClone(EMPTY_LEDGER),
      );
      this.documents.set(username, document);
    }
    return document;
  }
}

/**
 * A prefix match must land on a path boundary: renaming `Anime` must not
 * rewrite paths under `Anime Movies`.
 */
function matchesPrefix(candidate: string, prefix: string): boolean {
  if (candidate === prefix) return true;
  return candidate.startsWith(prefix) && /[/\\]/.test(candidate.charAt(prefix.length));
}

function remap(
  current: LedgerDocument,
  rewrite: (path: string) => string | null,
): LedgerDocument {
  const progress: LedgerDocument['progress'] = {};
  for (const [key, value] of Object.entries(current.progress)) {
    const next = rewrite(key);
    if (next !== null) progress[next] = value;
  }

  return {
    progress,
    recent: current.recent
      .map(entry => {
        const next = rewrite(entry.path);
        return next === null ? null : { ...entry, path: next };
      })
      .filter((entry): entry is LedgerDocument['recent'][number] => entry !== null),
    pinned: current.pinned
      .map(rewrite)
      .filter((value): value is string => value !== null),
  };
}

function applyPatch(current: LedgerDocument, patch: LedgerPatch): LedgerDocument {
  const progress = { ...current.progress };
  for (const [key, value] of Object.entries(patch.progress ?? {})) {
    if (value === null) delete progress[key];
    else progress[key] = value;
  }

  let recent = current.recent;
  if (patch.opened) {
    recent = [
      { path: patch.opened, openedAt: Date.now() },
      ...recent.filter(entry => entry.path !== patch.opened),
    ].slice(0, RECENT_LIMIT);
  }

  let pinned = current.pinned;
  if (patch.pin) {
    const without = pinned.filter(item => item !== patch.pin!.path);
    pinned = patch.pin.value ? [...without, patch.pin.path] : without;
  }

  return { progress: prune(progress), recent, pinned };
}

/** Keep the most recently saved positions so a large library cannot grow the file without bound. */
function prune(progress: LedgerDocument['progress']): LedgerDocument['progress'] {
  const entries = Object.entries(progress);
  if (entries.length <= PROGRESS_LIMIT) return progress;

  entries.sort(([, a], [, b]) => b.savedAt - a.savedAt);
  return Object.fromEntries(entries.slice(0, PROGRESS_LIMIT));
}

/** Usernames are arbitrary; filenames are not. Reversible, and readable for ASCII names. */
function encodeName(username: string): string {
  return username.replace(/[^A-Za-z0-9._-]/g, character =>
    `~${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}

function decodeName(encoded: string): string {
  return encoded.replace(/~([0-9a-f]{4})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}
