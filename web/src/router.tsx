import {
  createRootRoute,
  createRoute,
  createRouter,
  createHashHistory,
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

/**
 * Explorer state lives in the URL so that browser back and forward work, and
 * any view — a folder, a sort order, a search, an open preview — can be linked
 * or reloaded into exactly the same place.
 */
export interface ExplorerSearch {
  path: string;
  sort: SortField;
  direction: SortDirection;
  /** Search text; empty means "browse this directory". */
  q: string;
  recursive: boolean;
  type?: MediaKind;
  /** Path of the file open in the preview overlay. */
  preview?: string;
}

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

const explorerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (raw: Record<string, unknown>): ExplorerSearch => ({
    path: typeof raw.path === 'string' ? raw.path : '',
    sort: oneOf(SORT_FIELDS, raw.sort, 'name'),
    direction: oneOf(SORT_DIRECTIONS, raw.direction, 'asc'),
    q: typeof raw.q === 'string' ? raw.q : '',
    recursive: raw.recursive === true || raw.recursive === 'true',
    ...(MEDIA_KINDS.includes(raw.type as MediaKind) ? { type: raw.type as MediaKind } : {}),
    ...(typeof raw.preview === 'string' && raw.preview ? { preview: raw.preview } : {}),
  }),
  component: ExplorerPage,
});

const routeTree = rootRoute.addChildren([explorerRoute]);

/**
 * Hash history, so the deployment needs no SPA rewrite rule. Caddy serves the
 * bundle as static files under a path prefix that is only known at runtime; a
 * history-mode fallback would have to be configured to match it in a second
 * place, and getting that wrong breaks every deep link.
 */
export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: false,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export { explorerRoute };
