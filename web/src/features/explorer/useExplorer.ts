import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { FileEntry, ListResponse, SearchResponse, SortField } from '@hearth/shared';

import { api } from '@/lib/api';
import { usePreferences } from '@/features/preferences/preferences';
import { childLeadingTo } from '@/lib/format';
import { rootLinkOf } from './root-link';
import { explorerRoute, type ExplorerSearch } from './search';

export function useExplorer() {
  const search = explorerRoute.useSearch();
  const navigate = explorerRoute.useNavigate();

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

  const { rootLink, servedRoot } = useRootLink(search.root, navigate);
  const natural = usePreferences().preferences.naturalSort;
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
      natural,
    ],
    queryFn: ({ signal }) => {
      // No limit: the server returns the whole folder, up to its configured cap.
      const common = {
        path: search.path,
        sort: search.sort,
        direction: search.direction,
        natural,
      };
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
    // Never a path looked up in a root it was not meant for.
    enabled: rootLink.kind === 'here' || rootLink.kind === 'unnamed',
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
  // Worked out while rendering the new folder, not after it is drawn: a frame later the
  // list would first show at its top, then jump to the folder just left.
  const [cameFrom, setCameFrom] = useState(search.path);
  const [returningTo, setReturningTo] = useState<string | null>(null);
  if (cameFrom !== search.path) {
    setCameFrom(search.path);
    setReturningTo(childLeadingTo(search.path, cameFrom));
  }

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
    rootLink,
    servedRoot,
    clearReturningTo: useCallback(() => setReturningTo(null), []),
  };
}

/**
 * Which root the URL's folder is in (root-link.ts). A URL that names none is
 * given the served root's name in place, so from then on it keeps meaning
 * this folder whatever root is served later.
 */
function useRootLink(
  named: string | undefined,
  navigate: ReturnType<typeof explorerRoute.useNavigate>,
) {
  const roots = useQuery({ queryKey: ['roots'], queryFn: () => api.roots(), staleTime: 60_000 });
  const rootLink = rootLinkOf(named, roots.data?.roots);
  const servedRoot = roots.data?.roots.find(root => root.active);
  const nameIt = rootLink.kind === 'unnamed' ? servedRoot?.id : undefined;
  useEffect(() => {
    if (nameIt) void navigate({ search: current => ({ ...current, root: nameIt }), replace: true });
  }, [nameIt, navigate]);
  return { rootLink, servedRoot };
}

export type Explorer = ReturnType<typeof useExplorer>;
