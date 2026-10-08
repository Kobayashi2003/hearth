import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronsUpDown, Film, Folder, Image, LogOut, Music, Settings } from 'lucide-react';
import { toast } from 'sonner';
import type { MediaKind, RootDescriptor } from '@hearth/shared';

import { Wordmark } from '@/brand/Logo';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { explorerRoute } from '@/features/explorer/search';
import { useSession } from '@/features/session/session';
import { Button } from '@/ui/Button';
import { Menu, MenuChoice, MenuLabel } from '@/ui/Menu';

const COLLECTIONS: ReadonlyArray<[MediaKind, string, typeof Image]> = [
  ['image', 'Pictures', Image],
  ['video', 'Video', Film],
  ['audio', 'Music', Music],
];

/** Query families whose keys are paths inside the active root. */
const ROOT_SCOPED = new Set([
  'listing',
  'archive',
  'comic',
  'content',
  'html',
  'office',
  'probe',
  'trash',
]);

export function Sidebar({
  onNavigate,
  onSettings,
}: {
  onNavigate?: () => void;
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
  const top = useQuery({
    queryKey: ['listing', '', 'name', 'asc', '', true, undefined],
    queryFn: ({ signal }) => api.list({ path: '', sort: 'name', direction: 'asc' }, signal),
    staleTime: 30_000,
  });

  const active = roots.data?.roots.find(root => root.active);
  const folders = (top.data?.items ?? []).filter(entry => entry.isDirectory);
  const currentTop = search.path.split('/')[0] ?? '';

  const go = (changes: Partial<typeof search>) => {
    void navigate({
      search: current => ({ ...current, q: '', type: undefined, scope: 'below', ...changes }),
    });
    onNavigate?.();
  };

  const switchRoot = useRootSwitch(() => go({ path: '', type: search.type }));

  return (
    <nav aria-label="Places" className="flex h-full flex-col gap-5 px-3 pb-3 pt-4">
      <button
        type="button"
        onClick={() => go({ path: '' })}
        className="self-start rounded-lg px-2 py-1"
        aria-label="Home"
      >
        <Wordmark />
      </button>

      {can('admin') && roots.data && roots.data.roots.length > 1 ? (
        <RootSwitcher roots={roots.data.roots} onSwitch={id => void switchRoot(id)} />
      ) : null}

      <Section title="Collections">
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

      <Section title={active?.label ?? 'Folders'} grow>
        {folders.map(folder => (
          <Item
            key={folder.path}
            icon={<Folder />}
            active={!search.type && !search.q && currentTop === folder.path}
            onClick={() => go({ path: folder.path })}
          >
            {folder.name}
          </Item>
        ))}
        {top.isSuccess && folders.length === 0 ? (
          <p className="px-2.5 text-[12.5px] text-ink-3">No folders at the top level.</p>
        ) : null}
      </Section>

      <UserBar
        username={identity?.username ?? ''}
        onSettings={onSettings}
        onSignOut={() => void signOut()}
      />
    </nav>
  );
}

function Section({
  title,
  children,
  grow,
}: {
  title: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <section className={cn('flex min-h-0 flex-col', grow && 'flex-1')}>
      <h2 className="mb-1 truncate px-2.5 text-[12px] font-medium text-ink-3">{title}</h2>
      <div className="scroll-thin -mr-1 min-h-0 overflow-auto pr-1">{children}</div>
    </section>
  );
}

function Item({
  icon,
  active,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[13.5px] text-ink-2 hover:bg-sunken hover:text-ink [&_svg]:size-4 [&_svg]:shrink-0',
        // Big enough for a finger in the drawer.
        '[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:text-[15px]',
        active && 'bg-surface font-medium text-ink shadow-sm [&_svg]:text-glaze',
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

/**
 * Switching roots: listings and file contents are keyed by root-relative
 * path, so the old root's would pass for the new one's. They are dropped
 * rather than refetched, and `leave` moves off the old path before anything
 * asks for it again; everything else is refetched from the new root.
 */
function useRootSwitch(leave: () => void) {
  const queryClient = useQueryClient();
  return async (id: string) => {
    try {
      queryClient.setQueryData(['roots'], await api.switchRoot(id));
      queryClient.removeQueries({
        predicate: query => ROOT_SCOPED.has(String(query.queryKey[0])),
      });
      leave();
      await queryClient.invalidateQueries({
        predicate: query => {
          const family = String(query.queryKey[0]);
          return family !== 'roots' && !ROOT_SCOPED.has(family);
        },
      });
    } catch (error) {
      toast.error('The root could not be switched', {
        description: error instanceof Error ? error.message : undefined,
      });
    }
  };
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

function UserBar({
  username,
  onSettings,
  onSignOut,
}: {
  username: string;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-t border-line pt-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-glaze-wash text-[13px] font-semibold uppercase text-glaze-strong">
        {username.slice(0, 1)}
      </span>
      <span className="min-w-0 flex-1 truncate px-1 text-[13px]">{username}</span>
      <Button size="icon" onClick={onSettings} aria-label="Settings" title="Settings">
        <Settings />
      </Button>
      <Button size="icon" onClick={onSignOut} aria-label="Sign out" title="Sign out">
        <LogOut />
      </Button>
    </div>
  );
}
