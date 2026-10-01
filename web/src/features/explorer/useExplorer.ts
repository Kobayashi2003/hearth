import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { FileEntry, ListResponse, SearchResponse, SortField } from '@hearth/shared';

import { api } from '@/lib/api';
import { childLeadingTo } from '@/lib/format';
import { explorerRoute, type ExplorerSearch } from '@/router';

export function useExplorer() {
  const search = explorerRoute.useSearch();
  const navigate = useNavigate({ from: explorerRoute.fullPath });

  const patch = useCallback(
    (changes: Partial<ExplorerSearch>) => {
      // Only going to a folder is a new history entry; sorting and filtering adjust the view.
      void navigate({
        search: current => ({ ...current, ...changes }),
        replace: changes.path === undefined,
      });
    },
    [navigate],
  );

  const isSearching = search.q.trim().length > 0 || search.type !== undefined;
  // The root is always searched whole: that is what a collection is.
  const isRecursive = search.path === '' || search.scope !== 'here';

  const query = useQuery<ListResponse | SearchResponse>({
    queryKey: [
      'listing',
      search.path,
      search.sort,
      search.direction,
      search.q,
      search.scope,
      search.type,
    ],
    queryFn: ({ signal }) => {
      // No limit: the server returns the whole folder, up to its configured cap.
      const common = { path: search.path, sort: search.sort, direction: search.direction };
      return isSearching
        ? api.search(
            {
              ...common,
              q: search.q,
              recursive: isRecursive,
              type: search.type,
            },
            signal,
          )
        : api.list(common, signal);
    },
    // A re-sort keeps showing the rows it is reordering; a different folder or search does not.
    placeholderData: (previous, previousQuery) => {
      const key = previousQuery?.queryKey;
      const sameView =
        key &&
        key[1] === search.path &&
        key[4] === search.q &&
        key[5] === search.scope &&
        key[6] === search.type;
      return sameView ? previous : undefined;
    },
  });

  const entries: FileEntry[] = useMemo(() => query.data?.items ?? [], [query.data]);

  const openFolder = useCallback(
    (path: string) => patch({ path, q: '', type: undefined, scope: 'below' }),
    [patch],
  );

  const goUp = useCallback(() => {
    const cut = search.path.lastIndexOf('/');
    openFolder(cut === -1 ? '' : search.path.slice(0, cut));
  }, [search.path, openFolder]);

  const sortBy = useCallback(
    (field: SortField) =>
      patch({
        sort: field,
        direction: search.sort === field && search.direction === 'asc' ? 'desc' : 'asc',
      }),
    [patch, search.sort, search.direction],
  );

  // Derived from the path pair, so Back and breadcrumb clicks land the same way as "up".
  const cameFrom = useRef(search.path);
  const [returningTo, setReturningTo] = useState<string | null>(null);
  useEffect(() => {
    const previous = cameFrom.current;
    cameFrom.current = search.path;
    if (previous !== search.path) setReturningTo(childLeadingTo(search.path, previous));
  }, [search.path]);

  return {
    search,
    patch,
    isSearching,
    isRecursive,
    entries,
    total: query.data?.total ?? 0,
    /** The folder exceeded the response cap and only a prefix is shown. */
    isTruncated: query.data?.hasMore ?? false,
    provider: query.data && 'provider' in query.data ? query.data.provider : null,
    isPending: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    openFolder,
    goUp,
    sortBy,
    returningTo,
    clearReturningTo: useCallback(() => setReturningTo(null), []),
  };
}

export type Explorer = ReturnType<typeof useExplorer>;
