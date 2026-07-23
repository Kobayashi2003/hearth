import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Command,
  LayoutGrid,
  List as ListIcon,
  RefreshCw,
  Rows2,
  Rows3,
  Search,
  Settings,
  Upload,
  X,
} from 'lucide-react';
import type { MediaKind } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { HearthMark } from '@/components/brand/HearthMark';
import { cn } from '@/lib/cn';
import type { Density, ViewMode } from '@/hooks/usePreferences';
import { Breadcrumb } from './Breadcrumb';
import { SearchOptions } from './SearchOptions';
import { UserMenu } from './UserMenu';

/**
 * The command surface, in three clusters: navigation on the left, search in the
 * centre, view and account on the right. Everything else lives in the command
 * palette, which is what keeps this row readable on a phone.
 */
export function Toolbar({
  path,
  query,
  recursive,
  typeFilter,
  viewMode,
  density,
  isFetching,
  canWrite,
  onNavigate,
  onBack,
  onForward,
  onUp,
  onRefresh,
  onQueryChange,
  onRecursiveChange,
  onTypeFilterChange,
  onViewModeChange,
  onDensityChange,
  onUpload,
  onOpenPalette,
  onOpenSettings,
}: {
  path: string;
  query: string;
  recursive: boolean;
  typeFilter: MediaKind | undefined;
  viewMode: ViewMode;
  density: Density;
  isFetching: boolean;
  canWrite: boolean;
  onNavigate: (path: string) => void;
  onBack: () => void;
  onForward: () => void;
  onUp: () => void;
  onRefresh: () => void;
  onQueryChange: (query: string) => void;
  onRecursiveChange: (recursive: boolean) => void;
  onTypeFilterChange: (kind: MediaKind | undefined) => void;
  onViewModeChange: (mode: ViewMode) => void;
  onDensityChange: (density: Density) => void;
  onUpload: () => void;
  onOpenPalette: () => void;
  onOpenSettings: () => void;
}) {
  const searchRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(query);

  useEffect(() => setDraft(query), [query]);

  // Debounced, so typing does not fire a search per keystroke over a large tree.
  useEffect(() => {
    if (draft === query) return;
    const timer = window.setTimeout(() => onQueryChange(draft), 250);
    return () => window.clearTimeout(timer);
  }, [draft, query, onQueryChange]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <header className="shrink-0 border-b border-subtle bg-raised/80 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 px-2 py-2 sm:px-3">
        <HearthMark className="hidden h-5 w-5 shrink-0 text-primary sm:block" />

        <div className="flex shrink-0 items-center">
          <Tooltip label="Back (Alt+←)">
            <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label="Forward (Alt+→)">
            <Button variant="ghost" size="icon" onClick={onForward} aria-label="Forward">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label="Up one folder">
            <Button
              variant="ghost"
              size="icon"
              onClick={onUp}
              disabled={path === ''}
              aria-label="Up one folder"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip label="Refresh (F5)">
            <Button variant="ghost" size="icon" onClick={onRefresh} aria-label="Refresh">
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </Tooltip>
        </div>

        <div className="hidden min-w-0 flex-1 lg:block">
          <Breadcrumb path={path} onNavigate={onNavigate} />
        </div>

        <div className="relative min-w-0 flex-1 lg:max-w-sm lg:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            ref={searchRef}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            placeholder="Search files…"
            aria-label="Search files"
            className={cn(
              'h-9 w-full rounded-md border border-subtle bg-surface pl-8 pr-8 text-sm',
              'text-primary placeholder:text-muted focus:border-accent focus-visible:outline-none',
            )}
          />
          {draft ? (
            <button
              type="button"
              onClick={() => setDraft('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Tooltip label="Command palette (Ctrl+K)">
            <Button variant="ghost" size="icon" onClick={onOpenPalette} aria-label="Command palette">
              <Command className="h-4 w-4" />
            </Button>
          </Tooltip>

          <Tooltip label={viewMode === 'list' ? 'Switch to grid' : 'Switch to list'}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onViewModeChange(viewMode === 'list' ? 'grid' : 'list')}
              aria-label="Toggle view mode"
            >
              {viewMode === 'list' ? (
                <LayoutGrid className="h-4 w-4" />
              ) : (
                <ListIcon className="h-4 w-4" />
              )}
            </Button>
          </Tooltip>

          <Tooltip label={density === 'comfortable' ? 'Compact rows' : 'Comfortable rows'}>
            <Button
              variant="ghost"
              size="icon"
              className="hidden sm:inline-flex"
              onClick={() => onDensityChange(density === 'comfortable' ? 'compact' : 'comfortable')}
              aria-label="Toggle row density"
            >
              {density === 'comfortable' ? (
                <Rows3 className="h-4 w-4" />
              ) : (
                <Rows2 className="h-4 w-4" />
              )}
            </Button>
          </Tooltip>

          {canWrite ? (
            <Tooltip label="Upload (Ctrl+U)">
              <Button variant="ghost" size="icon" onClick={onUpload} aria-label="Upload">
                <Upload className="h-4 w-4" />
              </Button>
            </Tooltip>
          ) : null}

          <Tooltip label="Settings">
            <Button variant="ghost" size="icon" onClick={onOpenSettings} aria-label="Settings">
              <Settings className="h-4 w-4" />
            </Button>
          </Tooltip>

          <UserMenu />
        </div>
      </div>

      <div className="flex items-center gap-2 px-2 pb-2 lg:hidden">
        <Breadcrumb path={path} onNavigate={onNavigate} />
      </div>

      {query ? (
        <SearchOptions
          recursive={recursive}
          typeFilter={typeFilter}
          onRecursiveChange={onRecursiveChange}
          onTypeFilterChange={onTypeFilterChange}
        />
      ) : null}
    </header>
  );
}
