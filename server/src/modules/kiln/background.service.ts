import fsp from 'node:fs/promises';
import path from 'node:path';

import { HearthError } from '../../lib/errors.js';
import { isMediaKind } from '../../lib/mime.js';
import type { AppConfig } from '../../config/index.js';

/**
 * Wallpapers for the explorer background. They live in their own directory
 * outside the served tree, so choosing one never depends on the active root and
 * cannot be used to probe it.
 */
export class BackgroundService {
  constructor(private readonly config: AppConfig) {}

  async list(): Promise<string[]> {
    try {
      const entries = await fsp.readdir(this.config.storage.backgroundsDirectory, {
        withFileTypes: true,
      });
      return entries
        .filter(entry => entry.isFile() && isMediaKind(entry.name, 'image'))
        .map(entry => entry.name)
        .sort();
    } catch {
      // No backgrounds directory simply means no wallpapers are offered.
      return [];
    }
  }

  async pickRandom(): Promise<string> {
    const names = await this.list();
    const chosen = names[Math.floor(Math.random() * names.length)];
    if (!chosen) throw HearthError.notFound('No background images are available');
    return chosen;
  }

  /** Resolve a name against the backgrounds directory, rejecting any escape. */
  async resolve(name: string): Promise<string> {
    const names = await this.list();
    // Membership in the listing is the check — no path arithmetic on user input.
    if (!names.includes(name)) throw HearthError.notFound('No such background');
    return path.join(this.config.storage.backgroundsDirectory, name);
  }
}
