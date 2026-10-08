import { KINDS } from './FilterBar';
import type { SearchScope } from './search';
import type { Explorer } from './useExplorer';

export function headerTitle(explorer: Explorer, segments: string[], rootLabel: string) {
  const { search, isSearching } = explorer;
  if (!isSearching) return segments.at(-1) ?? rootLabel;
  if (search.q) return `“${search.q}”`;
  return KINDS.find(([kind]) => kind === search.type)?.[1];
}

export function countLine(explorer: Explorer, segments: string[], rootLabel: string): string {
  const { total, search } = explorer;
  // No count yet: a no-break space keeps the line, so nothing shifts when it arrives.
  if (explorer.isPending) return '\u00a0';
  if (explorer.isSearching) {
    return `${total.toLocaleString()} found ${scopePhrase(search.scope, segments.at(-1), rootLabel)}`;
  }
  return `${total.toLocaleString()} ${total === 1 ? 'item' : 'items'}`;
}

function scopePhrase(scope: SearchScope, folder: string | undefined, rootLabel: string): string {
  if (!folder) return `in all of ${rootLabel}`;
  return scope === 'here' ? `directly in ${folder}` : `in ${folder} and its subfolders`;
}

export const TITLE_SIZES = {
  short: 'text-[clamp(30px,5vw,52px)]',
  medium: 'text-[clamp(26px,3.6vw,40px)]',
  long: 'text-[clamp(22px,2.6vw,30px)]',
} as const;

/** One line on a phone: what does not fit is cut, and the whole name is in the tooltip and the path. */
export const COMPACT_TITLE_SIZES: Record<keyof typeof TITLE_SIZES, string> = {
  short: 'text-[28px]',
  medium: 'text-[24px]',
  long: 'text-[20px]',
};

/** Long names step down so a CJK album title does not outweigh the page; a full-width glyph counts double. */
export function titleScale(title: string): keyof typeof TITLE_SIZES {
  let width = 0;
  for (const character of title) {
    width +=
      /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6]/.test(
        character,
      )
        ? 1
        : 0.55;
  }
  if (width <= 14) return 'short';
  if (width <= 26) return 'medium';
  return 'long';
}
