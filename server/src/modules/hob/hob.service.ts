import path from 'node:path';

import { DEFAULT_HOB, type HobDocument, type HobPatch } from '@hearth/shared';

import { JsonDocument } from '../../lib/json-store.js';

/**
 * Hob — the shelf beside the fire, where things are left arranged the way you
 * like them.
 *
 * Deliberately a separate document from Ledger: this file is written perhaps
 * once a week, Ledger every few seconds during playback. Sharing storage would
 * let a background progress write clobber a preference set on another device.
 */
export class HobService {
  private readonly documents = new Map<string, JsonDocument<HobDocument>>();

  constructor(private readonly directory: string) {}

  read(username: string): HobDocument {
    // Spread over the defaults so a preference added in a later version appears
    // for people whose file predates it.
    return { ...DEFAULT_HOB, ...this.documentFor(username).read() };
  }

  async patch(username: string, patch: HobPatch): Promise<HobDocument> {
    return this.documentFor(username).update(current => ({
      ...DEFAULT_HOB,
      ...current,
      ...patch,
    }));
  }

  private documentFor(username: string): JsonDocument<HobDocument> {
    let document = this.documents.get(username);
    if (!document) {
      document = new JsonDocument<HobDocument>(
        path.join(this.directory, `${encodeName(username)}.json`),
        () => structuredClone(DEFAULT_HOB),
      );
      this.documents.set(username, document);
    }
    return document;
  }
}

/** Usernames are arbitrary; filenames are not. Readable for ASCII names. */
function encodeName(username: string): string {
  return username.replace(/[^A-Za-z0-9._-]/g, character =>
    `~${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
}
