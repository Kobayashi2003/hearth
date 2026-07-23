import { useCallback, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { FileEntry, ListResponse, SearchResponse, SortField } from '@hearth/shared';

import { api } from '@/lib/api';
import { explorerRoute, type ExplorerSearch } from '@/router';

const PAGE_SIZE = 500;

/** Browsing and searching answer with the same items; only the extras differ. */
type ListingPage = ListResponse | SearchResponse;

/**
 * Reads the explorer's state from the URL and fetches the matching listing.
 *
 * Putting path, sort, and query in the URL is what makes browser back and
 * forward behave the way people expect in a file manager, and lets any view be
 * bookmarked or shared.
 */
export function useExplorerState() {
  const search = explorerRoute.useSearch();
  const navigate = useNavigate({ from: explorerRoute.fullPath });

  const patch = useCallback(
    (changes: Partial<ExplorerSearch>) => {
      void navigate({
        search: current => ({ ...current, ...changes }),
        // Sorting and filtering are adjustments to one view, not new
        // destinations; only navigating to a folder should add a history entry.
        replace: changes.path === undefined,
      });
    },
    [navigate],
  );

  const isSearching = search.q.trim().length > 0;

  const query = useQuery<ListingPage>({
    queryKey: ['listing', search.path, search.sort, search.direction, search.q, search.recursive, search.type],
    queryFn: async ({ signal }): Promise<ListingPage> => {
      const common = {
        path: search.path,
        sort: search.sort,
        direction: search.direction,
        page: 1,
        limit: PAGE_SIZE,
      };
      return isSearching
        ? api.search(
            { ...common, q: search.q, recursive: search.recursive, type: search.type },
            signal,
          )
        : api.list(common, signal);
    },
    // Keeping the previous page visible while the next loads avoids the list
    // collapsing to a skeleton every time a sort or filter changes.
    placeholderData: previous => previous,
  });

  const entries: FileEntry[] = useMemo(() => query.data?.items ?? [], [query.data]);

  /** Files a preview can step through — directories are not part of a gallery. */
  const gallery = useMemo(() => entries.filter(entry => !entry.isDirectory), [entries]);

  const openDirectory = useCallback(
    (path: string) => patch({ path, q: '', preview: undefined }),
    [patch],
  );

  const goUp = useCallback(() => {
    const index = search.path.lastIndexOf('/');
    openDirectory(index === -1 ? '' : search.path.slice(0, index));
  }, [search.path, openDirectory]);

  /** Clicking the active sort column flips its direction, as in every file manager. */
  const sortBy = useCallback(
    (field: SortField) =>
      patch({
        sort: field,
        direction: search.sort === field && search.direction === 'asc' ? 'desc' : 'asc',
      }),
    [patch, search.sort, search.direction],
  );

  return {
    search,
    patch,
    isSearching,
    entries,
    gallery,
    total: query.data?.total ?? 0,
    // Only a search reports which backend answered.
    provider: query.data && 'provider' in query.data ? query.data.provider : null,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    openDirectory,
    goUp,
    sortBy,
    atRoot: search.path === '',
  };
}
