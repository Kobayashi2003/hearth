import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import {
  MEDIA_KINDS,
  SORT_DIRECTIONS,
  SORT_FIELDS,
  type MediaKind,
  type SortDirection,
  type SortField,
} from '@hearth/shared';

import { AppShell } from '@/features/shell/AppShell';
import { ExplorerPage } from '@/features/explorer/ExplorerPage';

/** Explorer state lives in the URL, so Back/Forward work like a file manager and any view is linkable. */
export interface ExplorerSearch {
  path: string;
  sort: SortField;
  direction: SortDirection;
  /** Empty means browsing, not searching. */
  q: string;
  /** Where a search or filter inside a folder looks; at the root it is always everything. */
  scope: SearchScope;
  type?: MediaKind;
}

export type SearchScope = 'here' | 'below';
const SCOPES: readonly SearchScope[] = ['here', 'below'];

function oneOf<T extends string>(allowed: readonly T[], value: unknown, fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

const rootRoute = createRootRoute({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});

export const explorerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (raw: Record<string, unknown>): ExplorerSearch => ({
    path: typeof raw.path === 'string' ? raw.path : '',
    sort: oneOf(SORT_FIELDS, raw.sort, 'name'),
    direction: oneOf(SORT_DIRECTIONS, raw.direction, 'asc'),
    q: typeof raw.q === 'string' ? raw.q : '',
    scope: oneOf(SCOPES, raw.scope, 'below'),
    ...(MEDIA_KINDS.includes(raw.type as MediaKind) ? { type: raw.type as MediaKind } : {}),
  }),
  component: ExplorerPage,
});

/** Hash history: the SPA is static files under a prefix only known at runtime, so no rewrite rule is needed. */
export const router = createRouter({
  routeTree: rootRoute.addChildren([explorerRoute]),
  history: createHashHistory(),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
