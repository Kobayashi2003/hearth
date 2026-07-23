import type { MediaKind } from '@hearth/shared';

import { cn } from '@/lib/cn';

const TYPE_FILTERS: Array<{ value: MediaKind | undefined; label: string }> = [
  { value: undefined, label: 'All' },
  { value: 'image', label: 'Images' },
  { value: 'audio', label: 'Audio' },
  { value: 'video', label: 'Video' },
];

/** The scope-and-type controls that appear under the toolbar while searching. */
export function SearchOptions({
  recursive,
  typeFilter,
  onRecursiveChange,
  onTypeFilterChange,
}: {
  recursive: boolean;
  typeFilter: MediaKind | undefined;
  onRecursiveChange: (recursive: boolean) => void;
  onTypeFilterChange: (kind: MediaKind | undefined) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-subtle px-3 py-1.5 text-xs">
      <span className="eyebrow">Search</span>

      <Segmented
        options={[
          { value: 'false', label: 'This folder' },
          { value: 'true', label: 'Everywhere' },
        ]}
        value={String(recursive)}
        onChange={value => onRecursiveChange(value === 'true')}
      />

      <Segmented
        options={TYPE_FILTERS.map(filter => ({ value: filter.value ?? '', label: filter.label }))}
        value={typeFilter ?? ''}
        onChange={value => onTypeFilterChange((value || undefined) as MediaKind | undefined)}
      />
    </div>
  );
}

/** A small pill-group toggle; the one selected option carries the ember wash. */
function Segmented({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div role="group" className="flex rounded-md border border-subtle p-0.5">
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            'rounded px-2 py-1 transition-colors duration-[--duration-instant]',
            value === option.value
              ? 'bg-accent-wash font-medium text-accent'
              : 'text-muted hover:text-primary',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
