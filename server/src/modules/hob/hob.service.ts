import { DEFAULT_HOB, type HobDocument, type HobPatch } from '@hearth/shared';

import { UserDocuments } from '../../lib/json-store.js';

/** Hob: per-user preferences. */
export class HobService {
  private readonly documents: UserDocuments<HobDocument>;

  constructor(directory: string) {
    this.documents = new UserDocuments<HobDocument>(directory, () => ({ ...DEFAULT_HOB }));
  }

  read(username: string): HobDocument {
    return pick({ ...DEFAULT_HOB, ...this.documents.for(username).read() });
  }

  async patch(username: string, patch: HobPatch): Promise<HobDocument> {
    return this.documents
      .for(username)
      .update(current => pick({ ...DEFAULT_HOB, ...current, ...patch }));
  }
}

/** Drops keys from older versions so they do not linger in the file forever. */
function pick(value: HobDocument): HobDocument {
  return Object.fromEntries(
    Object.keys(DEFAULT_HOB).map(key => [key, value[key as keyof HobDocument]]),
  ) as unknown as HobDocument;
}
