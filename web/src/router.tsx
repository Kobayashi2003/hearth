import {
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
} from '@tanstack/react-router';
import { AppShell } from '@/features/shell/AppShell';
import { ExplorerPage } from '@/features/explorer/ExplorerPage';
import { validateExplorerSearch } from '@/features/explorer/search';

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
  validateSearch: validateExplorerSearch,
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
