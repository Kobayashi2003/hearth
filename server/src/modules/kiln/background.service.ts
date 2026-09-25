import fsp from 'node:fs/promises';
import path from 'node:path';

import { HearthError } from '../../lib/errors.js';
import { isMediaKind } from '../../lib/mime.js';
import type { AppConfig } from '../../config/index.js';

/** Wallpapers live outside the served tree, so choosing one cannot probe the root. */
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
      return [];
    }
  }

  async pickRandom(): Promise<string> {
    const names = await this.list();
    const chosen = names[Math.floor(Math.random() * names.length)];
    if (!chosen) throw HearthError.notFound('No background images are available');
    return chosen;
  }

  async resolve(name: string): Promise<string> {
    const names = await this.list();
    // Membership is the check; no path arithmetic on user input.
    if (!names.includes(name)) throw HearthError.notFound('No such background');
    return path.join(this.config.storage.backgroundsDirectory, name);
  }
}
