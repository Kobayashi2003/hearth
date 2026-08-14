import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  MAX_PAGE_SIZE,
  type FileEntry,
  type ListResponse,
  type SearchResponse,
  type SortField,
} from '@hearth/shared';

import { api } from '@/lib/api';
import { explorerRoute, type ExplorerSearch } from '@/router';

/**
 * A folder is fetched whole rather than paged.
 *
 * The previous 500-entry page had no UI to reach page two, so a folder of 1 590
 * files showed 500 and silently dropped the rest — the server was returning
 * `hasMore: true` and nobody was reading it. Both views virtualise, so the cost
 * of holding a whole folder is the JSON, not the DOM: 1 590 entries is 323 KB.
 *
 * `MAX_PAGE_SIZE` still caps the response; when it bites, `hasMore` is surfaced
 * to the user rather than swallowed.
 */
const REQUEST_LIMIT = MAX_PAGE_SIZE;

/** Browsing and searching answer with the same items; only the extras differ. */
type ListingPage = ListResponse | SearchResponse;

/**
 * The child of `folder` on the way down to `descendant`, or null when
 * `descendant` is not below `folder`.
 *
 * `('A/B', 'A/B/C/D')` is `'A/B/C'`: the entry visible in `A/B` that the journey
 * went through. The root is the empty string, so it needs no separator of its
 * own — `('', 'A/B')` is `'A'`.
 */
function childLeadingTo(folder: string, descendant: string): string | null {
  const prefix = folder === '' ? '' : `${folder}/`;
  if (descendant === folder || !descendant.startsWith(prefix)) return null;

  const rest = descendant.slice(prefix.length);
  const cut = rest.indexOf('/');
  return prefix + (cut === -1 ? rest : rest.slice(0, cut));
}

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
        limit: REQUEST_LIMIT,
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

  const openDirectory = useCallback(
    (path: string) => patch({ path, q: '', preview: undefined }),
    [patch],
  );

  const goUp = useCallback(() => {
    const index = search.path.lastIndexOf('/');
    openDirectory(index === -1 ? '' : search.path.slice(0, index));
  }, [search.path, openDirectory]);

  /**
   * Which entry to put the cursor on when a listing arrives, or null for none.
   * Cleared once claimed, so it only steers the navigation it was set for.
   */
  const [returningFrom, setReturningFrom] = useState<string | null>(null);

  /**
   * Landing on an ancestor lands on the folder you came out of, not on the top
   * of the list.
   *
   * Coming out of `A/B/C/D` into `A/B`, the thing you were just looking at is
   * `C` — and in a folder of two hundred siblings, dumping you at the first one
   * means finding your place again by hand every time you step out.
   *
   * Derived from the path pair rather than set by `goUp`, because stepping out
   * is only one of the ways to get there: browser Back and a click on the
   * breadcrumb are the same journey and deserve the same landing.
   */
  const cameFrom = useRef(search.path);
  useEffect(() => {
    const previous = cameFrom.current;
    cameFrom.current = search.path;
    if (previous === search.path) return;
    setReturningFrom(childLeadingTo(search.path, previous));
  }, [search.path]);

  const returnedIndex = useMemo(() => {
    if (!returningFrom) return -1;
    return entries.findIndex(entry => entry.path === returningFrom);
  }, [entries, returningFrom]);

  const claimReturnedIndex = useCallback(() => setReturningFrom(null), []);

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
    /** Index of the folder just stepped out of, or -1. */
    returnedIndex,
    claimReturnedIndex,
    total: query.data?.total ?? 0,
    /** True when the folder exceeded the cap and is being shown as a prefix. */
    isTruncated: query.data?.hasMore ?? false,
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
