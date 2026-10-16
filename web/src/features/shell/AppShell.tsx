import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

import { LogoMark } from '@/brand/Logo';
import { api, mediaUrls } from '@/lib/api';
import { useKeyBindings } from '@/lib/keys';
import { LoginPage } from '@/features/session/LoginPage';
import { useSession } from '@/features/session/session';
import { PreferencesProvider, usePreferences } from '@/features/preferences/preferences';
import { PlayerProvider } from '@/features/preview/audio/PlayerProvider';
import { MiniPlayer } from '@/features/preview/audio/MiniPlayer';
import { PreviewOverlay } from '@/features/preview/PreviewOverlay';
import { PreviewProvider } from '@/features/preview/PreviewProvider';
import { SettingsDialog } from '@/features/settings/SettingsDialog';
import { DockProvider, DockSlot } from './Dock';
import { ShellContext } from './shell-context';
import { Sidebar } from './Sidebar';
import { DockedSidebar, DrawerSidebar } from './SidebarFrame';
import { useSidebarLayout } from './useSidebarLayout';

export function AppShell({ children }: { children: ReactNode }) {
  const { identity, isLoading } = useSession();

  if (isLoading) {
    return (
      <div className="grid h-dvh place-items-center">
        <LogoMark className="size-10 animate-pulse" />
      </div>
    );
  }
  if (!identity) return <LoginPage />;

  return (
    <PreferencesProvider>
      <PreviewProvider>
        <PlayerProvider>
          <DockProvider>
            <Frame>{children}</Frame>
          </DockProvider>
        </PlayerProvider>
      </PreviewProvider>
    </PreferencesProvider>
  );
}

function Frame({ children }: { children: ReactNode }) {
  const { preferences } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const roots = useQuery({ queryKey: ['roots'], queryFn: () => api.roots(), staleTime: 60_000 });
  const nav = useNav();

  const shell = useMemo(
    () => ({
      openSettings: () => setSettingsOpen(true),
      openNav: nav.kind ? nav.open : undefined,
      navKind: nav.kind,
      rootLabel: roots.data?.roots.find(root => root.active)?.label ?? 'Home',
    }),
    [nav.kind, nav.open, roots.data],
  );
  const sidebar = (
    <Sidebar
      onNavigate={nav.layout.mode === 'drawer' ? nav.close : undefined}
      onHide={nav.layout.mode === 'docked' ? () => nav.layout.setHidden(true) : undefined}
      onSettings={() => {
        nav.close();
        setSettingsOpen(true);
      }}
    />
  );

  return (
    <ShellContext value={shell}>
      {/* Clear of the notch and rounded corners; the bottom edge is left to the scrolling list. */}
      <div className="relative flex h-dvh overflow-hidden pt-[var(--safe-top)] pr-[var(--safe-right)] pl-[var(--safe-left)]">
        {preferences.wallpaper ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url("${mediaUrls.background(preferences.wallpaper)}")`,
              opacity: preferences.wallpaperOpacity,
            }}
          />
        ) : null}

        {nav.layout.mode === 'drawer' ? (
          <DrawerSidebar open={nav.drawerOpen} onOpenChange={nav.setDrawerOpen}>
            {sidebar}
          </DrawerSidebar>
        ) : (
          <DockedSidebar layout={nav.layout}>{sidebar}</DockedSidebar>
        )}

        <main className="relative z-10 flex min-w-0 flex-1 flex-col">{children}</main>
      </div>

      <DockSlot slot="left">
        <MiniPlayer />
      </DockSlot>
      <PreviewOverlay />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </ShellContext>
  );
}

/**
 * Where the sidebar is and how to bring it back. Ctrl+B shows or hides it,
 * docked or as a drawer, from anywhere but a text field.
 */
function useNav() {
  const layout = useSidebarLayout();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { mode, setHidden } = layout;
  const open = useCallback(() => {
    if (mode === 'drawer') setDrawerOpen(true);
    else setHidden(false);
  }, [mode, setHidden]);
  const close = useCallback(() => setDrawerOpen(false), []);

  useKeyBindings([
    {
      key: 'b',
      ctrl: true,
      shift: false,
      run: () => {
        if (mode === 'drawer') setDrawerOpen(value => !value);
        else setHidden(mode === 'docked');
      },
    },
  ]);

  // Read by the dock along the bottom, which lives outside this frame.
  const offset = mode === 'docked' ? layout.width : 0;
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-offset', `${offset}px`);
  }, [offset]);

  const kind =
    mode === 'drawer' ? ('drawer' as const) : mode === 'hidden' ? ('hidden' as const) : null;
  return {
    layout,
    kind,
    open,
    close,
    drawerOpen: mode === 'drawer' && drawerOpen,
    setDrawerOpen,
  };
}
