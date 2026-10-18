import type { RootDescriptor } from '@hearth/shared';

/**
 * Whether the URL's folder is in the root Hearth serves now. A path means
 * nothing without its root, and the root served is one setting for everyone:
 * after a switch, a restored tab, a bookmark or another open tab would show
 * the same path in the new root, an unrelated or missing folder.
 *
 * - `here`: the URL names the served root.
 * - `unnamed`: the URL names none (made before roots were named, or typed);
 *   it is taken as the served root and named from then on.
 * - `elsewhere`: it names another root, `root` when Hearth still has it.
 * - `unknown`: the roots have not loaded, so it cannot be told yet.
 */
export type RootLink =
  { kind: 'here' | 'unnamed' | 'unknown' } | { kind: 'elsewhere'; root: RootDescriptor | null };

export function rootLinkOf(
  named: string | undefined,
  roots: readonly RootDescriptor[] | undefined,
): RootLink {
  if (!named) return { kind: 'unnamed' };
  if (!roots) return { kind: 'unknown' };
  if (roots.find(root => root.active)?.id === named) return { kind: 'here' };
  return { kind: 'elsewhere', root: roots.find(root => root.id === named) ?? null };
}
