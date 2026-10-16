import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MAX_FAVORITES, type Favorite } from '@hearth/shared';

import { api } from '@/lib/api';
import { baseName } from '@/lib/format';
import { usePreferences } from '@/features/preferences/preferences';

export interface Favorites {
  /** The active root's favorites, in the order kept. */
  list: Favorite[];
  has: (path: string) => boolean;
  /** Adds it, or takes it away when it is already there. */
  toggle: (path: string) => void;
  remove: (path: string) => void;
  /** A label equal to the folder's own name clears it. */
  rename: (path: string, label: string) => void;
  /** To a place in this root's list. */
  move: (path: string, to: number) => void;
}

/** What a favorite is called: its own label, else the folder's name. */
export const labelOf = (favorite: Favorite) => favorite.label ?? (baseName(favorite.path) || '');

/**
 * Favorites live in Hob, so they follow the person to every device; each names
 * its root, and only the served root's appear.
 */
export function useFavorites(): Favorites {
  const { preferences, update } = usePreferences();
  const roots = useQuery({ queryKey: ['roots'], queryFn: () => api.roots(), staleTime: 60_000 });
  const root = roots.data?.roots.find(candidate => candidate.active)?.id;
  const all = preferences.favorites;

  const list = useMemo(
    () => (root ? all.filter(favorite => favorite.root === root) : []),
    [all, root],
  );
  /** This root's list replaced, the other roots' kept. */
  const save = useCallback(
    (next: Favorite[]) =>
      update('favorites', [...all.filter(favorite => favorite.root !== root), ...next]),
    [all, root, update],
  );

  const has = useCallback((path: string) => list.some(item => item.path === path), [list]);
  const remove = useCallback(
    (path: string) => save(list.filter(item => item.path !== path)),
    [list, save],
  );
  const toggle = useCallback(
    (path: string) => {
      if (!root) return;
      if (has(path)) return remove(path);
      if (all.length >= MAX_FAVORITES)
        return void toast.error(`Up to ${MAX_FAVORITES} favorites`, {
          description: 'Remove one to make room.',
        });
      save([...list, { root, path }]);
    },
    [all.length, has, list, remove, root, save],
  );
  const rename = useCallback(
    (path: string, label: string) =>
      save(
        list.map(item => {
          if (item.path !== path) return item;
          const { label: _previous, ...rest } = item;
          return label === baseName(path) ? rest : { ...rest, label };
        }),
      ),
    [list, save],
  );
  const move = useCallback(
    (path: string, to: number) => {
      const moving = list.find(item => item.path === path);
      if (!moving) return;
      const rest = list.filter(item => item !== moving);
      rest.splice(Math.max(0, Math.min(to, rest.length)), 0, moving);
      save(rest);
    },
    [list, save],
  );

  return { list, has, toggle, remove, rename, move };
}
