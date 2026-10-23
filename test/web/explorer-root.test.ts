// @vitest-environment jsdom
import { createElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  // Hearth serves D:\ now; E:\ is still a root, its drive not connected.
  roots: vi.fn(async () => ({
    roots: [
      { id: 'd0', label: 'D:\\', active: true, available: true },
      { id: 'e0', label: 'E:\\', active: false, available: false },
    ],
  })),
  list: vi.fn(async () => ({ items: [], total: 0, hasMore: false })),
  // The person's settings, as a server that has none saved yet answers.
  preferences: vi.fn(async () => ({})),
  search: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ api }));

const { useExplorer } = await import('@/features/explorer/useExplorer');
const { validateExplorerSearch } = await import('@/features/explorer/search');
const { PreferencesProvider } = await import('@/features/preferences/preferences');

let seen: ReturnType<typeof useExplorer> | null = null;
function Probe() {
  seen = useExplorer();
  return null;
}

/** The explorer hook on a real router, opened at `url`. */
function open(url: string) {
  const rootRoute = createRootRoute();
  const explorer = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    validateSearch: validateExplorerSearch,
    component: Probe,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([explorer]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(PreferencesProvider, null, createElement(RouterProvider, { router })),
    ),
  );
  return router;
}

beforeEach(() => {
  seen = null;
  api.list.mockClear();
});
afterEach(cleanup);

describe('a folder URL and the root it is in', () => {
  it('does not look the path up in the root served now when the URL names another', async () => {
    open('/?path=%E5%90%8C%E4%BA%BA&root=e0');
    await waitFor(() => expect(seen?.rootLink.kind).toBe('elsewhere'));
    expect(seen?.rootLink).toMatchObject({ root: { label: 'E:\\' } });
    expect(seen?.servedRoot?.id).toBe('d0');
    await act(async () => {});
    expect(api.list).not.toHaveBeenCalled();
  });

  it('names the served root in a URL that names none, and lists the folder', async () => {
    const router = open('/?path=Music');
    await waitFor(() => expect(router.state.location.search).toMatchObject({ root: 'd0' }));
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    expect(seen?.rootLink.kind).toBe('here');
  });

  it('lists the folder when the URL names the root served', async () => {
    open('/?path=Music&root=d0');
    await waitFor(() => expect(api.list).toHaveBeenCalled());
    // Natural order unless the person turned it off.
    expect(api.list.mock.calls[0]?.[0]).toMatchObject({ path: 'Music', natural: true });
  });
});
