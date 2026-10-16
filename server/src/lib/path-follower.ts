/**
 * Something that remembers files by root-relative path (reading positions,
 * favorite folders) and must follow them when Hearth moves, renames, restores
 * or deletes them for good.
 */
export interface PathFollower {
  reprefix(from: string, to: string): Promise<void>;
  /** Drop everything under a path that no longer exists. */
  forget(target: string): Promise<void>;
}

export function followAll(followers: readonly PathFollower[]): PathFollower {
  return {
    async reprefix(from, to) {
      if (from === to) return;
      for (const follower of followers) await follower.reprefix(from, to);
    },
    async forget(target) {
      for (const follower of followers) await follower.forget(target);
    },
  };
}

/** A prefix match must land on a path boundary: `Anime` must not match `Anime Movies`. */
export function isUnder(candidate: string, prefix: string): boolean {
  if (candidate === prefix) return true;
  return candidate.startsWith(prefix) && /[/\\]/.test(candidate.charAt(prefix.length));
}
