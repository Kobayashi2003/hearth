import { useEffect, useState, type RefObject } from 'react';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Menu as MenuIcon,
  Search,
} from 'lucide-react';
import type { ViewMode } from '@hearth/shared';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { FilterBar, KINDS } from './FilterBar';
import type { SearchScope } from './search';
import { SearchField } from './SearchField';
import { ViewTools } from './ViewTools';
import type { Explorer } from './useExplorer';

export function ExplorerHeader({
  explorer,
  rootLabel,
  viewMode,
  canWrite,
  onViewMode,
  onNewFolder,
  onUploadFiles,
  onUploadFolder,
  onOpenNav,
  searchRef,
}: {
  explorer: Explorer;
  rootLabel: string;
  viewMode: ViewMode;
  canWrite: boolean;
  onViewMode: (mode: ViewMode) => void;
  onNewFolder: () => void;
  onUploadFiles: () => void;
  onUploadFolder: () => void;
  /** Present on narrow screens, where the sidebar is a drawer. */
  onOpenNav?: (() => void) | undefined;
  searchRef: RefObject<HTMLInputElement | null>;
}) {
  const { search, patch, isSearching } = explorer;
  // On a phone the search field is an icon until wanted, then takes the whole row.
  const narrow = useMediaQuery('(max-width: 639px)');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTakesRow = narrow && (searchOpen || Boolean(search.q));
  useEffect(() => setSearchOpen(false), [search.path]);
  const segments = search.path ? search.path.split('/') : [];
  const title = headerTitle(explorer, segments, rootLabel);

  return (
    <header className="shrink-0 px-4 pt-3 sm:px-6">
      {searchTakesRow ? (
        <div className="flex h-10 items-center gap-1">
          <Button
            size="icon"
            aria-label="Close search"
            className="-ml-2"
            onClick={() => {
              setSearchOpen(false);
              patch({ q: '' });
            }}
          >
            <ArrowLeft />
          </Button>
          <SearchField
            explorer={explorer}
            inputRef={searchRef}
            autoFocus
            className="w-auto flex-1"
          />
        </div>
      ) : (
        <div className="flex h-10 items-center gap-1">
          {onOpenNav ? (
            <Button size="icon" onClick={onOpenNav} aria-label="Open navigation" className="-ml-2">
              <MenuIcon />
            </Button>
          ) : null}
          <div className="hidden items-center sm:flex">
            <Button
              size="icon"
              onClick={() => window.history.back()}
              aria-label="Back"
              title="Back"
            >
              <ArrowLeft />
            </Button>
            <Button
              size="icon"
              onClick={() => window.history.forward()}
              aria-label="Forward"
              title="Forward"
            >
              <ArrowRight />
            </Button>
          </div>
          <Button
            size="icon"
            onClick={explorer.goUp}
            disabled={search.path === ''}
            aria-label="Up one folder"
            title="Up (Alt+↑)"
          >
            <ArrowUp />
          </Button>

          <Breadcrumbs
            segments={isSearching ? segments : segments.slice(0, -1)}
            rootLabel={rootLabel}
            onOpen={explorer.openFolder}
          />

          {narrow ? (
            <Button size="icon" onClick={() => setSearchOpen(true)} aria-label="Search this folder">
              <Search />
            </Button>
          ) : (
            <SearchField explorer={explorer} inputRef={searchRef} />
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2 pb-3 [@media(max-height:500px)]:mt-1 [@media(max-height:500px)]:pb-2">
        <h1
          className={cn(
            'display-title line-clamp-2 min-w-0 max-w-full break-words pb-0.5 [@media(max-height:500px)]:text-[26px]',
            TITLE_SIZES[titleScale(title ?? '')],
          )}
          title={title}
        >
          {title}
        </h1>
        <p className="tabular pb-1 text-[13px] text-ink-3">
          {countLine(explorer, segments, rootLabel)}
        </p>

        <ViewTools
          explorer={explorer}
          viewMode={viewMode}
          canWrite={canWrite}
          onViewMode={onViewMode}
          onNewFolder={onNewFolder}
          onUploadFiles={onUploadFiles}
          onUploadFolder={onUploadFolder}
        />
      </div>
      <FilterBar explorer={explorer} />
    </header>
  );
}

/** The folder above this one, back to the root; while filtering the folder itself joins it. */
function Breadcrumbs({
  segments,
  rootLabel,
  onOpen,
}: {
  segments: string[];
  rootLabel: string;
  onOpen: (path: string) => void;
}) {
  return (
    <nav
      aria-label="Folder path"
      className="ml-1 flex min-w-0 flex-1 items-center overflow-hidden text-[13px] text-ink-3"
    >
      <button
        type="button"
        className="shrink-0 rounded px-1 hover:text-ink"
        onClick={() => onOpen('')}
      >
        {rootLabel}
      </button>
      {segments.map((segment, index) => (
        <span key={index} className="flex min-w-0 items-center">
          <ChevronRight className="size-3.5 shrink-0" />
          <button
            type="button"
            className="truncate rounded px-1 hover:text-ink"
            onClick={() => onOpen(segments.slice(0, index + 1).join('/'))}
          >
            {segment}
          </button>
        </span>
      ))}
    </nav>
  );
}

function headerTitle(explorer: Explorer, segments: string[], rootLabel: string) {
  const { search, isSearching } = explorer;
  if (!isSearching) return segments.at(-1) ?? rootLabel;
  if (search.q) return `“${search.q}”`;
  return KINDS.find(([kind]) => kind === search.type)?.[1];
}

function countLine(explorer: Explorer, segments: string[], rootLabel: string): string {
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

const TITLE_SIZES = {
  short: 'text-[clamp(30px,5vw,52px)]',
  medium: 'text-[clamp(26px,3.6vw,40px)]',
  long: 'text-[clamp(22px,2.6vw,30px)]',
} as const;

/** Long names step down so a CJK album title does not outweigh the page; a full-width glyph counts double. */
function titleScale(title: string): keyof typeof TITLE_SIZES {
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
