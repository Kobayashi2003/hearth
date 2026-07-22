import fsp from 'node:fs/promises';
import path from 'node:path';

import type { OperationResult } from '@hearth/shared';

import { fromNodeError, HearthError } from '../../lib/errors.js';
import { assertValidEntryName, type SafePath, type Vault } from '../../lib/vault.js';

/**
 * Mutating filesystem operations. Every method takes `SafePath`s, so the
 * containment and permission checks have provably already happened.
 */
export class FileOpsService {
  constructor(private readonly vault: Vault) {}

  async makeDirectory(parent: SafePath, name: string): Promise<string> {
    const target = this.vault.child(parent, name);
    try {
      await fsp.mkdir(target);
    } catch (error) {
      throw fromNodeError(error, 'Could not create that folder');
    }
    return this.vault.relativize(target);
  }

  async rename(target: SafePath, name: string): Promise<string> {
    assertValidEntryName(name);
    const destination = path.join(path.dirname(target), name) as SafePath;

    // A pure case change is a legitimate rename that would otherwise look like
    // a collision on a case-insensitive filesystem.
    if (destination.toLowerCase() !== target.toLowerCase() && (await exists(destination))) {
      throw HearthError.conflict('An item with that name already exists here');
    }

    try {
      await fsp.rename(target, destination);
    } catch (error) {
      throw fromNodeError(error, 'Could not rename that item');
    }
    return this.vault.relativize(destination);
  }

  /**
   * Copy or move many sources into one directory. One failing source does not
   * abort the rest — each reports its own outcome.
   */
  async transfer(
    sources: SafePath[],
    destination: SafePath,
    mode: 'copy' | 'move',
  ): Promise<OperationResult[]> {
    const results: OperationResult[] = [];

    for (const source of sources) {
      const relative = this.vault.relativize(source);
      try {
        results.push({
          path: relative,
          ok: true,
          resultPath: await this.transferOne(source, destination, mode),
        });
      } catch (error) {
        results.push({
          path: relative,
          ok: false,
          error: error instanceof HearthError ? error.message : 'Operation failed',
        });
      }
    }

    return results;
  }

  private async transferOne(
    source: SafePath,
    destination: SafePath,
    mode: 'copy' | 'move',
  ): Promise<string> {
    this.assertTransferable(source, destination);

    const target = (await resolveCollision(destination, path.basename(source))) as SafePath;
    try {
      if (mode === 'copy') {
        await fsp.cp(source, target, { recursive: true, errorOnExist: true, force: false });
      } else {
        await this.move(source, target);
      }
    } catch (error) {
      throw fromNodeError(error, `Could not ${mode} that item`);
    }
    return this.vault.relativize(target);
  }

  /**
   * `rename` fails across volumes; fall back to copy-then-delete so a move
   * between two configured roots on different drives still works.
   */
  private async move(source: SafePath, target: SafePath): Promise<void> {
    try {
      await fsp.rename(source, target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error;
      await fsp.cp(source, target, { recursive: true, errorOnExist: true, force: false });
      await fsp.rm(source, { recursive: true, force: true });
    }
  }

  /**
   * Moving a folder inside itself would recurse until the disk fills. Landing
   * back in its own parent is allowed — that is a no-op move, or a "(2)" copy.
   */
  private assertTransferable(source: SafePath, destination: SafePath): void {
    const from = path.resolve(source);
    const into = path.resolve(destination);

    if (from === into) throw HearthError.badRequest('Cannot move a folder into itself');
    if (into.toLowerCase().startsWith(from.toLowerCase() + path.sep)) {
      throw HearthError.badRequest('Cannot move a folder into one of its own subfolders');
    }
  }

  async remove(target: SafePath): Promise<void> {
    try {
      await fsp.rm(target, { recursive: true, force: false });
    } catch (error) {
      throw fromNodeError(error, 'Could not delete that item');
    }
  }
}

export async function exists(target: string): Promise<boolean> {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

const MAX_COLLISION_ATTEMPTS = 1000;

/**
 * Produce a free path in `directory` for `name`, suffixing "(2)", "(3)"… the
 * way Windows does. Never silently overwrites an existing item.
 */
export async function resolveCollision(directory: string, name: string): Promise<string> {
  const candidate = path.join(directory, name);
  if (!(await exists(candidate))) return candidate;

  const extension = path.extname(name);
  const stem = name.slice(0, name.length - extension.length);

  for (let attempt = 2; attempt < MAX_COLLISION_ATTEMPTS; attempt += 1) {
    const next = path.join(directory, `${stem} (${attempt})${extension}`);
    if (!(await exists(next))) return next;
  }

  throw HearthError.conflict('Too many items with that name already exist here');
}
