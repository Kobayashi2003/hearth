import { useEffect, useRef, useState } from 'react';

import { useMediaQuery } from '@/hooks/useMediaQuery';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  FolderPlus,
  FolderUp,
  LayoutGrid,
  List,
  Menu as MenuIcon,
  Plus,
  RefreshCw,
  Search,
  Upload,
  X,
} from 'lucide-react';
import type { MediaKind, SortField, ViewMode } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Field';
import { Kbd } from '@/ui/Feedback';
import { Menu, MenuChoice, MenuItem, MenuLabel, MenuSeparator } from '@/ui/Menu';
import type { Explorer } from './useExplorer';

const SORTS: ReadonlyArray<[SortField, string]> = [
  ['name', 'Name'],
  ['mtime', 'Date modified'],
  ['size', 'Size'],
  ['type', 'Type'],
];

const KINDS: ReadonlyArray<[MediaKind, string]> = [
  ['image', 'Pictures'],
  ['video', 'Video'],
  ['audio', 'Music'],
];

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
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const { search, patch, isSearching, total, isFetching } = explorer;
  // On a phone the search field is an icon until wanted, then takes the whole row.
  const narrow = useMediaQuery('(max-width: 639px)');
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTakesRow = narrow && (searchOpen || Boolean(search.q));
  useEffect(() => setSearchOpen(false), [search.path]);
  const segments = search.path ? search.path.split('/') : [];
  const title = isSearching
    ? search.q
      ? `“${search.q}”`
      : KINDS.find(([kind]) => kind === search.type)?.[1]
    : (segments.at(-1) ?? rootLabel);

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

          <nav
            aria-label="Folder path"
            className="ml-1 flex min-w-0 flex-1 items-center overflow-hidden text-[13px] text-ink-3"
          >
            <button
              type="button"
              className="shrink-0 rounded px-1 hover:text-ink"
              onClick={() => explorer.openFolder('')}
            >
              {rootLabel}
            </button>
            {segments.slice(0, -1).map((segment, index) => (
              <span key={index} className="flex min-w-0 items-center">
                <ChevronRight className="size-3.5 shrink-0" />
                <button
                  type="button"
                  className="truncate rounded px-1 hover:text-ink"
                  onClick={() => explorer.openFolder(segments.slice(0, index + 1).join('/'))}
                >
                  {segment}
                </button>
              </span>
            ))}
          </nav>

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
          className="display-title line-clamp-2 min-w-0 max-w-full break-words pb-0.5 text-[clamp(30px,5vw,52px)] [@media(max-height:500px)]:text-[26px]"
          title={title}
        >
          {title}
        </h1>
        <p className="tabular pb-1 text-[13px] text-ink-3">
          {isSearching
            ? `${total.toLocaleString()} found ${search.recursive ? 'in' : 'directly in'} ${segments.at(-1) ?? rootLabel}`
            : `${total.toLocaleString()} ${total === 1 ? 'item' : 'items'}`}
        </p>

        <div className="ml-auto flex shrink-0 items-center gap-1 pb-0.5">
          <Button
            size="icon"
            onClick={() => void explorer.refetch()}
            aria-label="Refresh"
            title="Refresh (F5)"
          >
            <RefreshCw className={cn(isFetching && 'animate-spin')} />
          </Button>
          <Menu
            trigger={
              <Button size="icon" aria-label="Sort" title="Sort">
                <ArrowUpDown />
              </Button>
            }
          >
            <MenuLabel>Sort by</MenuLabel>
            {SORTS.map(([field, label]) => (
              <MenuChoice
                key={field}
                checked={search.sort === field}
                onSelect={() => patch({ sort: field })}
              >
                {label}
              </MenuChoice>
            ))}
            <MenuSeparator />
            <MenuChoice
              checked={search.direction === 'asc'}
              onSelect={() => patch({ direction: 'asc' })}
            >
              Ascending
            </MenuChoice>
            <MenuChoice
              checked={search.direction === 'desc'}
              onSelect={() => patch({ direction: 'desc' })}
            >
              Descending
            </MenuChoice>
          </Menu>
          <Segmented<ViewMode>
            label="View"
            value={viewMode}
            onChange={onViewMode}
            options={[
              { value: 'list', label: <List />, title: 'List' },
              { value: 'grid', label: <LayoutGrid />, title: 'Covers' },
            ]}
          />
          {canWrite ? (
            <Menu
              trigger={
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-1 max-sm:w-9 max-sm:justify-center max-sm:px-0"
                  aria-label="New"
                >
                  <Plus />
                  <span className="max-sm:hidden">New</span>
                </Button>
              }
            >
              <MenuItem icon={<FolderPlus />} onSelect={onNewFolder} shortcut="Ctrl+Shift+N">
                Folder
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Upload />} onSelect={onUploadFiles} shortcut="Ctrl+U">
                Upload files
              </MenuItem>
              <MenuItem icon={<FolderUp />} onSelect={onUploadFolder}>
                Upload a folder
              </MenuItem>
            </Menu>
          ) : null}
        </div>
      </div>
      {isSearching ? <SearchScope explorer={explorer} /> : null}
    </header>
  );
}

function SearchField({
  explorer,
  inputRef,
  autoFocus,
  className,
}: {
  explorer: Explorer;
  inputRef: React.RefObject<HTMLInputElement | null>;
  autoFocus?: boolean;
  className?: string;
}) {
  const { search, patch } = explorer;
  const [text, setText] = useState(search.q);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setText(search.q), [search.q]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const commit = (value: string) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => patch({ q: value.trim() }), 300);
  };

  return (
    <label
      className={cn(
        'flex h-9 w-[clamp(9rem,32vw,22rem)] shrink-0 items-center gap-2 rounded-xl bg-surface px-3 ring-1 ring-line focus-within:ring-2 focus-within:ring-glaze',
        className,
      )}
    >
      <Search className="size-4 shrink-0 text-ink-3" />
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={text}
        onChange={event => {
          setText(event.target.value);
          commit(event.target.value);
        }}
        onKeyDown={event => {
          if (event.key === 'Escape' && text) {
            event.stopPropagation();
            setText('');
            patch({ q: '' });
          } else if (event.key === 'Enter') {
            window.clearTimeout(timer.current);
            patch({ q: text.trim() });
          }
        }}
        placeholder="Search here"
        aria-label="Search file names"
        className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
      />
      {text ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setText('');
            patch({ q: '', type: undefined });
          }}
          className="text-ink-3 hover:text-ink"
        >
          <X className="size-4" />
        </button>
      ) : (
        <span className="hidden lg:block">
          <Kbd>/</Kbd>
        </span>
      )}
    </label>
  );
}

function SearchScope({ explorer }: { explorer: Explorer }) {
  const { search, patch } = explorer;
  return (
    <div className="-mx-4 mb-3 flex items-center gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:-mx-6 sm:px-6">
      {KINDS.map(([kind, label]) => (
        <button
          key={kind}
          type="button"
          aria-pressed={search.type === kind}
          onClick={() => patch({ type: search.type === kind ? undefined : kind })}
          className={cn(
            'h-7 shrink-0 whitespace-nowrap rounded-full border px-2.5 text-[12.5px]',
            search.type === kind
              ? 'border-glaze bg-glaze-wash text-glaze-strong'
              : 'border-line text-ink-2 hover:border-ink-3',
          )}
        >
          {label}
        </button>
      ))}
      <button
        type="button"
        aria-pressed={!search.recursive}
        onClick={() => patch({ recursive: !search.recursive })}
        className={cn(
          'h-7 shrink-0 whitespace-nowrap rounded-full border px-2.5 text-[12.5px]',
          !search.recursive
            ? 'border-glaze bg-glaze-wash text-glaze-strong'
            : 'border-line text-ink-2 hover:border-ink-3',
        )}
      >
        Only this folder
      </button>
    </div>
  );
}
