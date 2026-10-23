import { useQuery } from '@tanstack/react-query';
import { ChevronsUpDown, Film, Folder, Image, Music, PanelLeftClose } from 'lucide-react';
import type { MediaKind, RootDescriptor } from '@hearth/shared';

import { Wordmark } from '@/brand/Logo';
import { api } from '@/lib/api';
import { explorerRoute } from '@/features/explorer/search';
import { usePreferences } from '@/features/preferences/preferences';
import { useSession } from '@/features/session/session';
import { Button } from '@/ui/Button';
import { Menu, MenuChoice, MenuLabel } from '@/ui/Menu';
import { FavoritesSection } from './FavoritesSection';
import { useRootSwitch } from './root-switch';
import { Item, Section, UserBar } from './SidebarParts';

const COLLECTIONS: ReadonlyArray<[MediaKind, string, typeof Image]> = [
  ['image', 'Pictures', Image],
  ['video', 'Video', Film],
  ['audio', 'Music', Music],
];

export function Sidebar({
  onNavigate,
  onHide,
  onSettings,
}: {
  onNavigate?: (() => void) | undefined;
  /** Present while docked: puts the sidebar away. */
  onHide?: (() => void) | undefined;
  onSettings: () => void;
}) {
  const { identity, can, signOut } = useSession();
  const search = explorerRoute.useSearch();
  const navigate = explorerRoute.useNavigate();
  const roots = useQuery({
    queryKey: ['roots'],
    queryFn: () => api.roots(),
    staleTime: 60_000,
    // A root whose drive is not connected is greyed out; notice when it comes back.
    refetchInterval: query =>
      query.state.data?.roots.some(root => !root.available) ? 30_000 : false,
  });

  const active = roots.data?.roots.find(root => root.active);
  // The folder on screen; a search or a collection is not "in" one.
  const here = !search.type && !search.q ? search.path : null;

  const go = (changes: Partial<typeof search>) => {
    void navigate({
      search: current => ({
        ...current,
        q: '',
        type: undefined,
        scope: 'below',
        root: active?.id,
        ...changes,
      }),
    });
    onNavigate?.();
  };

  const switchRoot = useRootSwitch();

  return (
    <nav aria-label="Places" className="flex h-full flex-col gap-3 pb-3 pt-4">
      <div className="flex items-center gap-1 px-3">
        <HomeButton root={active} onClick={() => go({ path: '' })} />
        <span className="flex-1" />
        {onHide ? (
          <Button
            size="icon"
            onClick={onHide}
            aria-label="Hide sidebar"
            title="Hide sidebar (Ctrl+B)"
            className="text-ink-3"
          >
            <PanelLeftClose />
          </Button>
        ) : null}
      </div>

      {can('admin') && roots.data && roots.data.roots.length > 1 ? (
        <div className="flex flex-col px-3">
          <RootSwitcher
            roots={roots.data.roots}
            onSwitch={id =>
              void switchRoot(id, () => go({ path: '', type: search.type, root: id }))
            }
          />
        </div>
      ) : null}

      <div className="scroll-thin flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain px-3">
        <Section id="collections" title="Collections">
          {COLLECTIONS.map(([kind, label, Icon]) => (
            <Item
              key={kind}
              icon={<Icon />}
              // A collection is the whole root; the same filter inside a folder is not it.
              active={search.type === kind && !search.q && search.path === ''}
              onClick={() => go({ path: '', type: kind })}
            >
              {label}
            </Item>
          ))}
        </Section>

        <FavoritesSection currentPath={here} root={active} onOpen={path => go({ path })} />

        <TopFolders currentPath={here} root={active} onOpen={path => go({ path })} />
      </div>

      <div className="px-3">
        <UserBar
          username={identity?.username ?? ''}
          onSettings={onSettings}
          onSignOut={() => void signOut()}
        />
      </div>
    </nav>
  );
}

/** The root's own first level of folders; the one the folder on screen is under is marked. */
function TopFolders({
  currentPath,
  root,
  onOpen,
}: {
  currentPath: string | null;
  root: RootDescriptor | undefined;
  onOpen: (path: string) => void;
}) {
  const currentTop = currentPath?.split('/')[0] ?? null;
  const natural = usePreferences().preferences.naturalSort;
  const top = useQuery({
    queryKey: ['listing', '', 'name', 'asc', '', true, undefined, natural],
    queryFn: ({ signal }) =>
      api.list({ path: '', sort: 'name', direction: 'asc', natural }, signal),
    staleTime: 30_000,
  });
  const folders = (top.data?.items ?? []).filter(entry => entry.isDirectory);
  return (
    <Section id="folders" title={root?.label ?? 'Folders'}>
      {folders.map(folder => (
        <Item
          key={folder.path}
          icon={<Folder />}
          active={currentTop === folder.path}
          onClick={() => onOpen(folder.path)}
          title={folder.name}
        >
          {folder.name}
        </Item>
      ))}
      {top.isSuccess && folders.length === 0 ? (
        <p className="px-2.5 text-[12.5px] text-ink-3">No folders at the top level.</p>
      ) : null}
    </Section>
  );
}

/** The wordmark: back to the top of the root being served, with any search or filter dropped. */
function HomeButton({ root, onClick }: { root: RootDescriptor | undefined; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start rounded-lg px-2 py-1 transition-colors hover:bg-sunken"
      aria-label="Home"
      title={`Back to the top of ${root?.label ?? 'the root'}`}
    >
      <Wordmark />
    </button>
  );
}

/** Which root to serve; one whose drive is not connected cannot be chosen until it is. */
function RootSwitcher({
  roots,
  onSwitch,
}: {
  roots: RootDescriptor[];
  onSwitch: (id: string) => void;
}) {
  const active = roots.find(root => root.active);
  return (
    <Menu
      align="start"
      trigger={
        <button
          type="button"
          className="flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-left text-[13px] hover:border-ink-3"
        >
          <span className="min-w-0 flex-1 truncate">{active?.label ?? 'Root'}</span>
          <ChevronsUpDown className="size-4 text-ink-3" />
        </button>
      }
    >
      <MenuLabel>Serve from</MenuLabel>
      {roots.map(root => (
        <MenuChoice
          key={root.id}
          checked={root.active}
          closes
          disabled={!root.available && !root.active}
          onSelect={() => {
            if (!root.active) onSwitch(root.id);
          }}
        >
          {root.label}
          {root.available ? null : <span className="ml-2 text-ink-3">not connected</span>}
        </MenuChoice>
      ))}
    </Menu>
  );
}
