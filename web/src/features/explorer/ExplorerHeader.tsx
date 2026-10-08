import { useState, type ReactNode, type RefObject } from 'react';

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Menu as MenuIcon,
  Search,
} from 'lucide-react';
import type { ViewMode } from '@hearth/shared';

import { useIsCompact, useIsNarrow } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { FilterBar } from './FilterBar';
import {
  COMPACT_TITLE_SIZES,
  countLine,
  headerTitle,
  TITLE_SIZES,
  titleScale,
} from './header-title';
import { SearchField } from './SearchField';
import { NewMenu, ViewMenu, ViewTools, type ToolProps } from './ViewTools';
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
  collapsed,
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
  /** Scrolled down the listing: a compact header folds to its first row. */
  collapsed: boolean;
}) {
  const { search, patch } = explorer;
  // On a phone the search field is an icon until wanted, then takes the whole row.
  const narrow = useIsNarrow();
  const compact = useIsCompact();
  const [searchOpen, setSearchOpen] = useState(false);
  // A new folder starts with the search closed.
  const [searchedIn, setSearchedIn] = useState(search.path);
  if (searchedIn !== search.path) {
    setSearchedIn(search.path);
    setSearchOpen(false);
  }
  const searchTakesRow = narrow && (searchOpen || Boolean(search.q));
  const segments = search.path ? search.path.split('/') : [];
  const title = headerTitle(explorer, segments, rootLabel);
  const folded = compact && collapsed;
  const tools: ToolProps = {
    viewMode,
    canWrite,
    onViewMode,
    onNewFolder,
    onUploadFiles,
    onUploadFolder,
  };

  return (
    <header className={cn('shrink-0 px-4 sm:px-6', compact ? 'pt-1' : 'pt-3')}>
      {searchTakesRow ? (
        <SearchRow
          explorer={explorer}
          searchRef={searchRef}
          onClose={() => {
            setSearchOpen(false);
            patch({ q: '' });
          }}
        />
      ) : (
        <NavRow
          explorer={explorer}
          rootLabel={rootLabel}
          segments={segments}
          onOpenNav={onOpenNav}
          // Folded away, the title takes the path's place, so where you are stays in sight.
          heading={folded ? title : null}
          search={
            narrow ? (
              <Button
                size="icon"
                onClick={() => setSearchOpen(true)}
                aria-label="Search this folder"
              >
                <Search />
              </Button>
            ) : (
              <SearchField explorer={explorer} inputRef={searchRef} />
            )
          }
          tools={compact ? <CompactTools explorer={explorer} tools={tools} /> : null}
        />
      )}

      {folded ? null : (
        <>
          <TitleRow
            explorer={explorer}
            title={title}
            count={countLine(explorer, segments, rootLabel)}
            compact={compact}
            tools={tools}
          />
          <FilterBar explorer={explorer} />
        </>
      )}
    </header>
  );
}

/** A phone's search: back out of it, and the field across the row. */
function SearchRow({
  explorer,
  searchRef,
  onClose,
}: {
  explorer: Explorer;
  searchRef: RefObject<HTMLInputElement | null>;
  onClose: () => void;
}) {
  return (
    <div className="flex h-11 items-center gap-1">
      <Button size="icon" aria-label="Close search" className="-ml-2" onClick={onClose}>
        <ArrowLeft />
      </Button>
      <SearchField explorer={explorer} inputRef={searchRef} autoFocus className="w-auto flex-1" />
    </div>
  );
}

/** The toolbar folded into the first row: the view menu and, for writers, New. */
function CompactTools({ explorer, tools }: { explorer: Explorer; tools: ToolProps }) {
  return (
    <>
      <ViewMenu explorer={explorer} viewMode={tools.viewMode} onViewMode={tools.onViewMode} />
      {tools.canWrite ? (
        <NewMenu
          compact
          onNewFolder={tools.onNewFolder}
          onUploadFiles={tools.onUploadFiles}
          onUploadFolder={tools.onUploadFolder}
        />
      ) : null}
    </>
  );
}

/** The folder's name and count; with room, the toolbar beside them. */
function TitleRow({
  explorer,
  title,
  count,
  compact,
  tools,
}: {
  explorer: Explorer;
  title: string | undefined;
  count: string;
  compact: boolean;
  tools: ToolProps;
}) {
  const scale = titleScale(title ?? '');
  return (
    <div
      className={cn(
        'flex flex-wrap items-end gap-x-4 gap-y-2',
        compact ? 'mt-1 pb-2' : 'mt-4 pb-3',
      )}
    >
      <h1
        className={cn(
          'display-title min-w-0 max-w-full break-words pb-0.5',
          compact
            ? cn('truncate', COMPACT_TITLE_SIZES[scale])
            : cn('line-clamp-2', TITLE_SIZES[scale]),
        )}
        title={title}
      >
        {title}
      </h1>
      <p className="tabular pb-1 text-[13px] text-ink-3">{count}</p>
      {compact ? null : <ViewTools explorer={explorer} {...tools} />}
    </div>
  );
}

/** Menu, back, forward and up, then the path (or the folder's name, folded), search and tools. */
function NavRow({
  explorer,
  rootLabel,
  segments,
  onOpenNav,
  heading,
  search,
  tools,
}: {
  explorer: Explorer;
  rootLabel: string;
  segments: string[];
  onOpenNav: (() => void) | undefined;
  heading: string | null | undefined;
  search: ReactNode;
  tools: ReactNode;
}) {
  return (
    <div className="flex h-11 items-center gap-0.5 sm:gap-1">
      {onOpenNav ? (
        <Button size="icon" onClick={onOpenNav} aria-label="Open navigation" className="-ml-2">
          <MenuIcon />
        </Button>
      ) : null}
      <div className="hidden items-center sm:flex">
        <Button size="icon" onClick={() => window.history.back()} aria-label="Back" title="Back">
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
        disabled={explorer.search.path === ''}
        aria-label="Up one folder"
        title="Up (Alt+↑)"
      >
        <ArrowUp />
      </Button>

      {heading ? (
        <h1 className="ml-1 min-w-0 flex-1 truncate text-[16px] font-semibold" title={heading}>
          {heading}
        </h1>
      ) : (
        <Breadcrumbs
          segments={explorer.isSearching ? segments : segments.slice(0, -1)}
          rootLabel={rootLabel}
          onOpen={explorer.openFolder}
        />
      )}

      {search}
      {tools}
    </div>
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
