import type { MediaKind } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { Segmented } from '@/ui/Field';
import type { SearchScope } from './search';
import type { Explorer } from './useExplorer';

export const KINDS: ReadonlyArray<[MediaKind, string]> = [
  ['image', 'Pictures'],
  ['video', 'Video'],
  ['audio', 'Music'],
];

const chip = (active: boolean) =>
  cn(
    'h-7 shrink-0 whitespace-nowrap rounded-full border px-2.5 text-[12.5px]',
    active
      ? 'border-glaze bg-glaze-wash text-glaze-strong'
      : 'border-line text-ink-2 hover:border-ink-3',
  );

/**
 * Type filters apply where you are, subfolders included, so "every video under
 * this folder" is one click. Inside a folder a switch narrows a filter or search
 * to the folder alone; the whole root is the sidebar's collections.
 */
export function FilterBar({ explorer }: { explorer: Explorer }) {
  const { search, patch, isSearching } = explorer;

  return (
    <div className="-mx-4 mb-3 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6">
      {KINDS.map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          aria-pressed={search.type === kind}
          onClick={() => patch({ type: search.type === kind ? undefined : kind })}
          className={chip(search.type === kind)}
        >
          {label}
        </button>
      ))}
      {isSearching && search.path !== '' ? (
        <div className="ml-auto shrink-0 pl-2">
          <Segmented<SearchScope>
            label="Where to look"
            value={search.scope}
            onChange={scope => patch({ scope })}
            options={[
              { value: 'here', label: 'Only here' },
              { value: 'below', label: 'With subfolders' },
            ]}
          />
        </div>
      ) : null}
    </div>
  );
}
