import { ArrowLeftToLine, ArrowRightToLine, BookOpen, ChevronLeft, ChevronRight, Minus, Plus, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Spinner, Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { neighbour } from '@/lib/steps';
import type { EpubSettings } from './useEpubBook';
import type { TocEntry } from './epub-layout';
import type { SearchHit } from './useEpubSearch';

/**
 * The reader's side panels: contents, find, and settings.
 *
 * They live apart from the viewer because they are forms, not reading surface —
 * the viewer is already carrying the book, the chrome and the page turning, and
 * mixing a settings form into that made the one file where every EPUB decision
 * had to be found.
 */

export const FONT_SIZES = [80, 90, 100, 115, 130, 150, 175];
const LINE_HEIGHTS = [1.3, 1.5, 1.7, 1.9];

const FONT_FAMILIES: Array<{ label: string; value: string | null }> = [
  { label: 'Book', value: null },
  { label: 'Serif', value: 'Georgia, "Songti SC", "Yu Mincho", serif' },
  { label: 'Sans', value: '"Segoe UI", "PingFang SC", "Hiragino Sans", sans-serif' },
];

export function Contents({
  entries,
  onSelect,
}: {
  entries: TocEntry[];
  onSelect: (href: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <nav aria-label="Contents" className="min-h-0 flex-1 overflow-y-auto py-2">
        <p className="px-3 py-2 text-xs text-muted">This book has no table of contents.</p>
      </nav>
    );
  }

  return (
    <nav aria-label="Contents" className="min-h-0 flex-1 overflow-y-auto py-2">
      {entries.map((entry, index) => (
        <button
          key={`${entry.href}-${index}`}
          type="button"
          onClick={() => onSelect(entry.href)}
          className="block min-h-tap w-full truncate px-3 py-1.5 text-left text-[0.8125rem] text-secondary hover:bg-raised hover:text-primary"
          style={{ paddingLeft: `${0.75 + entry.depth * 0.75}rem` }}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Find in book. The walk is slow — every section is loaded, asked and dropped —
 * so the panel says so while it runs rather than looking broken, and the hit list
 * is what stays behind afterwards to step through.
 */
export function FindPanel({
  query,
  hits,
  index,
  isSearching,
  onQueryChange,
  onRun,
  onGoTo,
  onClear,
}: {
  query: string;
  hits: SearchHit[];
  index: number;
  isSearching: boolean;
  onQueryChange: (value: string) => void;
  onRun: () => void;
  onGoTo: (index: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <form
        className="flex items-center gap-1.5 border-b border-subtle p-2"
        onSubmit={event => {
          event.preventDefault();
          onRun();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder="Find in book…"
            aria-label="Find in book"
            autoFocus
            className="h-8 w-full rounded-density bg-raised px-2 pr-7 text-xs text-primary outline-none placeholder:text-muted"
          />
          {query ? (
            <button
              type="button"
              onClick={onClear}
              aria-label="Clear the search"
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
        <Button variant="primary" size="sm" type="submit" disabled={isSearching}>
          {isSearching ? <Spinner className="h-3.5 w-3.5" /> : 'Find'}
        </Button>
      </form>

      {hits.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-b border-subtle px-3 py-1">
          <span className="tabular text-[0.6875rem] text-muted">
            {index + 1} of {hits.length}
          </span>
          <div className="flex">
            <Tooltip label="Previous match">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onGoTo(index - 1)}
                aria-label="Previous match"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
            <Tooltip label="Next match">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onGoTo(index + 1)}
                aria-label="Next match"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {hits.map((hit, position) => (
          <button
            key={hit.cfi}
            type="button"
            onClick={() => onGoTo(position)}
            title={hit.excerpt}
            className={cn(
              'block w-full px-3 py-1.5 text-left text-[0.75rem] leading-snug',
              'line-clamp-2 hover:bg-raised',
              position === index ? 'text-accent' : 'text-secondary',
            )}
          >
            {hit.excerpt || '(no surrounding text)'}
          </button>
        ))}

        {hits.length === 0 && query && !isSearching ? (
          <p className="px-3 py-2 text-xs text-muted">Nothing found in this book.</p>
        ) : null}
      </div>
    </div>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  detectedRtl,
}: {
  settings: EpubSettings;
  onChange: (next: EpubSettings) => void;
  detectedRtl: boolean;
}) {
  const set = <K extends keyof EpubSettings>(key: K, value: EpubSettings[K]) =>
    onChange({ ...settings, [key]: value });

  return (
    <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3">
      <Field label="Text size">
        <Stepper
          value={`${settings.fontSizePercent}%`}
          onDecrease={() =>
            set('fontSizePercent', neighbour(FONT_SIZES, settings.fontSizePercent, -1))
          }
          onIncrease={() =>
            set('fontSizePercent', neighbour(FONT_SIZES, settings.fontSizePercent, 1))
          }
          decreaseLabel="Smaller text"
          increaseLabel="Larger text"
        />
      </Field>

      <Field label="Typeface">
        <Choices
          options={FONT_FAMILIES.map(font => ({ label: font.label, value: font.value }))}
          value={settings.fontFamily}
          onSelect={value => set('fontFamily', value)}
        />
      </Field>

      <Field label="Line spacing">
        <Stepper
          value={settings.lineHeight.toFixed(1)}
          onDecrease={() => set('lineHeight', neighbour(LINE_HEIGHTS, settings.lineHeight, -1))}
          onIncrease={() => set('lineHeight', neighbour(LINE_HEIGHTS, settings.lineHeight, 1))}
          decreaseLabel="Tighter lines"
          increaseLabel="Looser lines"
        />
      </Field>

      <Field
        label="Reading direction"
        hint={
          settings.direction === 'auto'
            ? `Book says ${detectedRtl ? 'right to left' : 'left to right'}`
            : undefined
        }
      >
        <Choices
          options={[
            { label: 'Auto', value: 'auto' as const },
            { label: 'LTR', value: 'ltr' as const, icon: <ArrowRightToLine className="h-3 w-3" /> },
            { label: 'RTL', value: 'rtl' as const, icon: <ArrowLeftToLine className="h-3 w-3" /> },
          ]}
          value={settings.direction}
          onSelect={value => set('direction', value)}
        />
      </Field>

      <Field label="Two-page spread" hint="Side by side when the window is wide enough.">
        <Choices
          options={[
            { label: 'Off', value: 'none' as const },
            { label: 'On', value: 'auto' as const, icon: <BookOpen className="h-3 w-3" /> },
          ]}
          value={settings.spread}
          onSelect={value => set('spread', value)}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <p className="eyebrow">{label}</p>
      {children}
      {hint ? <p className="text-[0.6875rem] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}

function Stepper({
  value,
  onDecrease,
  onIncrease,
  decreaseLabel,
  increaseLabel,
}: {
  value: string;
  onDecrease: () => void;
  onIncrease: () => void;
  decreaseLabel: string;
  increaseLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="icon" onClick={onDecrease} aria-label={decreaseLabel}>
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="tabular w-12 text-center text-xs text-secondary">{value}</span>
      <Button variant="ghost" size="icon" onClick={onIncrease} aria-label={increaseLabel}>
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function Choices<T extends string | null>({
  options,
  value,
  onSelect,
}: {
  options: Array<{ label: string; value: T; icon?: React.ReactNode }>;
  value: T;
  onSelect: (value: T) => void;
}) {
  return (
    <div className="flex gap-1">
      {options.map(option => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onSelect(option.value)}
          aria-pressed={option.value === value}
          className={cn(
            'flex flex-1 items-center justify-center gap-1 rounded-density px-2 py-1.5 text-xs',
            option.value === value
              ? 'bg-accent text-on-accent'
              : 'bg-raised text-secondary hover:text-primary',
          )}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
