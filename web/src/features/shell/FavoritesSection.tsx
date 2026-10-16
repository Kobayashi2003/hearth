import { useRef, useState, type DragEvent, type HTMLAttributes, type PointerEvent } from 'react';
import { ArrowDown, ArrowUp, FolderOpen, Pencil, Star, StarOff } from 'lucide-react';
import type { Favorite, RootDescriptor } from '@hearth/shared';

import { useCoarsePointer } from '@/hooks/useMediaQuery';
import { cn } from '@/lib/cn';
import { baseName, parentOf } from '@/lib/format';
import { ContextMenu } from '@/features/explorer/ContextMenu';
import type { EntryAction } from '@/features/explorer/actions';
import { NameDialog } from '@/ui/NameDialog';
import { labelOf, useFavorites, type Favorites } from './favorites';
import { Item, Section } from './SidebarParts';

const LONG_PRESS_MS = 480;
const MOVE_TOLERANCE_PX = 10;
const DRAG_TYPE = 'application/x-hearth-favorite';

/**
 * Folders kept by hand, above the root's own. Reordered by dragging with a
 * mouse, or from each one's menu (⋯, right-click, long-press), which also
 * renames and removes. Added from a folder's menu in the listing.
 */
export function FavoritesSection({
  currentPath,
  root,
  onOpen,
}: {
  /** The folder on screen, or null in a search or collection: nothing is "here" then. */
  currentPath: string | null;
  root: RootDescriptor | undefined;
  onOpen: (path: string) => void;
}) {
  const rootLabel = root?.label ?? 'Home';
  const favorites = useFavorites();
  const coarse = useCoarsePointer();
  const [menu, setMenu] = useState<{ favorite: Favorite; x: number; y: number } | null>(null);
  const [renaming, setRenaming] = useState<Favorite | null>(null);
  const reorder = useReorder(favorites);
  const longPress = useLongPress();
  const suffixes = suffixesFor(favorites.list, rootLabel);

  return (
    <Section id="favorites" title="Favorites">
      {favorites.list.map((favorite, index) => (
        <Item
          key={favorite.path}
          icon={<Star />}
          active={currentPath === favorite.path}
          onClick={() => onOpen(favorite.path)}
          suffix={suffixes.get(favorite.path)}
          title={[rootLabel, ...favorite.path.split('/')].join(' › ')}
          onMenu={(x, y) => setMenu({ favorite, x, y })}
          rowProps={{
            ...reorder.rowProps(favorite, index, !coarse),
            ...longPress((x, y) => setMenu({ favorite, x, y })),
          }}
          className={reorder.indicator(index)}
        >
          {labelOf(favorite)}
        </Item>
      ))}
      {favorites.list.length === 0 ? (
        <p className="px-2.5 py-1 text-[12.5px] leading-snug text-ink-3">
          {coarse ? 'Long-press' : 'Right-click'} a folder and choose Add to favorites.
        </p>
      ) : null}

      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          title={labelOf(menu.favorite)}
          actions={favoriteActions(menu.favorite, favorites, {
            open: onOpen,
            rename: setRenaming,
          })}
          onClose={() => setMenu(null)}
        />
      ) : null}
      <NameDialog
        open={renaming !== null}
        title="Rename favorite"
        action="Rename"
        initial={renaming ? labelOf(renaming) : ''}
        onClose={() => setRenaming(null)}
        onSubmit={label => renaming && favorites.rename(renaming.path, label)}
      />
    </Section>
  );
}

function favoriteActions(
  favorite: Favorite,
  favorites: Favorites,
  handlers: { open: (path: string) => void; rename: (favorite: Favorite) => void },
): EntryAction[] {
  const index = favorites.list.indexOf(favorite);
  const actions: EntryAction[] = [
    { id: 'open', label: 'Open', icon: FolderOpen, run: () => handlers.open(favorite.path) },
    { id: 'rename', label: 'Rename…', icon: Pencil, run: () => handlers.rename(favorite) },
  ];
  if (index > 0)
    actions.push({
      id: 'up',
      label: 'Move up',
      icon: ArrowUp,
      run: () => favorites.move(favorite.path, index - 1),
    });
  if (index < favorites.list.length - 1)
    actions.push({
      id: 'down',
      label: 'Move down',
      icon: ArrowDown,
      run: () => favorites.move(favorite.path, index + 1),
    });
  actions.push({
    id: 'remove',
    label: 'Remove from favorites',
    icon: StarOff,
    danger: true,
    run: () => favorites.remove(favorite.path),
  });
  return actions;
}

/**
 * Two favorites called the same (every show has a "Season 1") are told apart
 * by the folder each is in.
 */
function suffixesFor(list: Favorite[], rootLabel: string): Map<string, string> {
  const counts = new Map<string, number>();
  for (const favorite of list)
    counts.set(labelOf(favorite), (counts.get(labelOf(favorite)) ?? 0) + 1);
  const suffixes = new Map<string, string>();
  for (const favorite of list) {
    if ((counts.get(labelOf(favorite)) ?? 0) < 2) continue;
    suffixes.set(favorite.path, baseName(parentOf(favorite.path)) || rootLabel);
  }
  return suffixes;
}

/**
 * Dragging a favorite with the mouse: a line shows where it will land, above
 * or below the row under the pointer.
 */
function useReorder(favorites: Favorites) {
  const [target, setTarget] = useState<{ index: number; after: boolean } | null>(null);
  const dragged = useRef<string | null>(null);

  const placeOf = (event: DragEvent<HTMLDivElement>, index: number) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { index, after: event.clientY > box.top + box.height / 2 };
  };

  return {
    rowProps(favorite: Favorite, index: number, enabled: boolean): HTMLAttributes<HTMLDivElement> {
      if (!enabled) return {};
      return {
        draggable: true,
        onDragStart(event) {
          dragged.current = favorite.path;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData(DRAG_TYPE, favorite.path);
        },
        onDragOver(event) {
          if (!dragged.current) return;
          event.preventDefault();
          setTarget(placeOf(event, index));
        },
        onDrop(event) {
          event.preventDefault();
          const path = dragged.current;
          const place = placeOf(event, index);
          const from = favorites.list.findIndex(item => item.path === path);
          if (path && from >= 0) {
            const to = place.index + (place.after ? 1 : 0);
            favorites.move(path, to > from ? to - 1 : to);
          }
          setTarget(null);
        },
        onDragEnd() {
          dragged.current = null;
          setTarget(null);
        },
      };
    },
    indicator(index: number): string | undefined {
      if (target?.index !== index) return undefined;
      return cn(
        "after:pointer-events-none after:absolute after:inset-x-2 after:h-0.5 after:rounded-full after:bg-glaze after:content-['']",
        target.after ? 'after:-bottom-px' : 'after:-top-px',
      );
    },
  };
}

/**
 * A long press opens the menu on touch. The click that ends it would also
 * open the folder, so that one click is swallowed.
 */
function useLongPress() {
  const press = useRef({ timer: 0, x: 0, y: 0, fired: false });
  return (open: (x: number, y: number) => void): HTMLAttributes<HTMLDivElement> => ({
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      const state = press.current;
      state.fired = false;
      if (event.pointerType === 'mouse') return;
      state.x = event.clientX;
      state.y = event.clientY;
      state.timer = window.setTimeout(() => {
        state.fired = true;
        navigator.vibrate?.(10);
        open(state.x, state.y);
      }, LONG_PRESS_MS);
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const state = press.current;
      if (Math.hypot(event.clientX - state.x, event.clientY - state.y) > MOVE_TOLERANCE_PX)
        window.clearTimeout(state.timer);
    },
    onPointerUp: () => window.clearTimeout(press.current.timer),
    onPointerCancel: () => window.clearTimeout(press.current.timer),
    onClickCapture(event) {
      if (!press.current.fired) return;
      event.preventDefault();
      event.stopPropagation();
      press.current.fired = false;
    },
  });
}
