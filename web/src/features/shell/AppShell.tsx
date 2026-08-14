import { createContext, use, useMemo, type ReactNode } from 'react';

import { Spinner } from '@/components/ui/primitives';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { useSession } from '@/features/auth/SessionProvider';
import { usePreferences, type Preferences } from '@/features/hob/usePreferences';
import { mediaUrls } from '@/lib/api';
import { PreviewProvider } from '@/features/mantel/PreviewProvider';
import { PreviewLayer } from '@/features/mantel/PreviewLayer';
import { BottomTrayProvider } from './BottomTray';

interface ShellValue {
  preferences: Preferences;
  updatePreference: ReturnType<typeof usePreferences>['update'];
}

const ShellContext = createContext<ShellValue | null>(null);

export function useShell(): ShellValue {
  const value = use(ShellContext);
  if (!value) throw new Error('useShell must be used inside AppShell');
  return value;
}

/**
 * The application frame: authentication gate, preferences, wallpaper, and the
 * preview layer.
 *
 * The preview layer is mounted here, above the routed content, so a pinned
 * audio player keeps playing while the user navigates — its media element never
 * unmounts, which is the fix for playback stopping when a pinned preview closed.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { identity, isLoading } = useSession();
  const { preferences, update } = usePreferences();

  const shellValue = useMemo(
    () => ({ preferences, updatePreference: update }),
    [preferences, update],
  );

  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!identity) return <LoginScreen />;

  return (
    <ShellContext value={shellValue}>
      <PreviewProvider>
        <div
          className="relative flex h-dvh flex-col overflow-hidden bg-surface"
          data-density={preferences.density}
        >
          <Wallpaper preferences={preferences} />
          {/* The tray owns the bottom edge for everyone who wants to float
              something there; see BottomTray. */}
          <BottomTrayProvider>
            <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
            <PreviewLayer />
          </BottomTrayProvider>
        </div>
      </PreviewProvider>
    </ShellContext>
  );
}

/**
 * The wallpaper sits behind everything at reduced opacity. It is decoration, so
 * it is hidden from assistive technology and never intercepts a pointer.
 */
function Wallpaper({ preferences }: { preferences: Preferences }) {
  if (!preferences.wallpaper) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 bg-cover bg-center"
      style={{
        backgroundImage: `url("${mediaUrls.background(preferences.wallpaper)}")`,
        opacity: preferences.wallpaperOpacity,
      }}
    />
  );
}
