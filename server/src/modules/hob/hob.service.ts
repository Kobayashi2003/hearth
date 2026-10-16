import { DEFAULT_HOB, type Favorite, type HobDocument, type HobPatch } from '@hearth/shared';

import { UserDocuments } from '../../lib/json-store.js';
import { isUnder, type PathFollower } from '../../lib/path-follower.js';

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

  /**
   * Favorites follow folders that move inside the root being served; the
   * root is read when the change happens, since favorites name theirs.
   */
  favoritesFollower(activeRoot: () => string): PathFollower {
    return {
      reprefix: (from, to) =>
        this.rewriteFavorites(activeRoot(), favorite =>
          isUnder(favorite.path, from)
            ? { ...favorite, path: to + favorite.path.slice(from.length) }
            : favorite,
        ),
      forget: target =>
        this.rewriteFavorites(activeRoot(), favorite =>
          isUnder(favorite.path, target) ? null : favorite,
        ),
    };
  }

  private async rewriteFavorites(
    root: string,
    rewrite: (favorite: Favorite) => Favorite | null,
  ): Promise<void> {
    for (const username of await this.documents.usernames()) {
      try {
        await this.documents.for(username).update(current => {
          const favorites = (current.favorites ?? []).flatMap(favorite =>
            favorite.root === root ? (rewrite(favorite) ?? []) : [favorite],
          );
          return { ...current, favorites };
        });
      } catch {
        // A favorite is a convenience; it must not fail the file operation that already succeeded.
      }
    }
  }
}

/** Drops keys from older versions so they do not linger in the file forever. */
function pick(value: HobDocument): HobDocument {
  return Object.fromEntries(
    Object.keys(DEFAULT_HOB).map(key => [key, value[key as keyof HobDocument]]),
  ) as unknown as HobDocument;
}
