import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Small JSON persistence helpers for the handful of files Hearth keeps in
 * `data/`. Writes go to a sibling temp file and are renamed into place, so a
 * crash mid-write cannot truncate the previous good copy.
 */

export function readJsonFile<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

export async function writeJsonFileAtomic(filePath: string, value: unknown): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await fsp.writeFile(tempPath, JSON.stringify(value, null, 2), 'utf8');
  await fsp.rename(tempPath, filePath);
}

/**
 * Serialises writes to one file so concurrent mutations cannot interleave and
 * lose an update. Reads are served from the in-memory copy.
 */
export class JsonDocument<T> {
  private cache: T | null = null;
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly initial: () => T,
  ) {}

  read(): T {
    this.cache ??= readJsonFile<T>(this.filePath) ?? this.initial();
    return this.cache;
  }

  /** Applies `mutate` to the current value and persists the result. */
  async update(mutate: (current: T) => T): Promise<T> {
    const next = mutate(this.read());
    this.cache = next;

    // The queue waits for the previous write either way: a transient disk error
    // must not leave every later update rejecting against a poisoned chain.
    const write = this.pending.then(
      () => writeJsonFileAtomic(this.filePath, next),
      () => writeJsonFileAtomic(this.filePath, next),
    );
    this.pending = write.catch(() => undefined);

    try {
      await write;
    } catch (error) {
      // Disk still holds the previous value; drop the optimistic copy rather
      // than serving reads that disagree with what was persisted.
      this.invalidate();
      throw error;
    }
    return next;
  }

  /** Drops the in-memory copy so the next read re-reads from disk. */
  invalidate(): void {
    this.cache = null;
  }
}
