import { useMemo, useState, type ReactNode } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';

import { LogoMark } from '@/brand/Logo';
import { api, mediaUrls } from '@/lib/api';
import { useIsWide } from '@/hooks/useMediaQuery';
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
  const isWide = useIsWide();
  const { preferences } = usePreferences();
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const roots = useQuery({ queryKey: ['roots'], queryFn: () => api.roots(), staleTime: 60_000 });

  const shell = useMemo(
    () => ({
      openSettings: () => setSettingsOpen(true),
      openNav: isWide ? undefined : () => setNavOpen(true),
      rootLabel: roots.data?.roots.find(root => root.active)?.label ?? 'Home',
    }),
    [isWide, roots.data],
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

        {isWide ? (
          <aside className="relative z-10 w-64 shrink-0 border-r border-line">
            <Sidebar onSettings={() => setSettingsOpen(true)} />
          </aside>
        ) : (
          <RadixDialog.Root open={navOpen} onOpenChange={setNavOpen}>
            <RadixDialog.Portal>
              <RadixDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-fade-out" />
              <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 w-[min(18rem,85vw)] bg-bg pt-[var(--safe-top)] pb-[var(--safe-bottom)] pl-[var(--safe-left)] shadow-float outline-none animate-slide-in data-[state=closed]:animate-slide-out">
                <RadixDialog.Title className="sr-only">Places</RadixDialog.Title>
                <RadixDialog.Description className="sr-only">
                  Folders and collections
                </RadixDialog.Description>
                <Sidebar
                  onNavigate={() => setNavOpen(false)}
                  onSettings={() => {
                    setNavOpen(false);
                    setSettingsOpen(true);
                  }}
                />
              </RadixDialog.Content>
            </RadixDialog.Portal>
          </RadixDialog.Root>
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
