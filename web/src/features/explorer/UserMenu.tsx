import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, LogOut, Monitor, Moon, Sun, User } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useSession } from '@/features/auth/SessionProvider';
import { useShell } from '@/features/shell/AppShell';
import type { Theme } from '@/hooks/usePreferences';

const THEMES: Array<{ value: Theme; label: string; icon: typeof Sun }> = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match system', icon: Monitor },
];

export function UserMenu() {
  const { identity, signOut } = useSession();
  const { preferences, updatePreference } = useShell();

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account and appearance">
          <User className="h-4 w-4" />
        </Button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          className="z-50 min-w-52 rounded-lg border border-subtle bg-overlay p-1 text-sm shadow-lg"
        >
          <div className="px-2 py-1.5">
            <p className="truncate font-medium text-primary">{identity?.username}</p>
            <p className="font-mono text-[0.6875rem] text-muted">
              {identity?.actions.join(' · ') || 'no permissions'}
            </p>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-subtle" />
          <DropdownMenu.Label className="eyebrow px-2 py-1">Appearance</DropdownMenu.Label>

          {THEMES.map(theme => {
            const Icon = theme.icon;
            return (
              <DropdownMenu.Item
                key={theme.value}
                onSelect={() => updatePreference('theme', theme.value)}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
                  'text-secondary data-[highlighted]:bg-sunken data-[highlighted]:text-primary',
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{theme.label}</span>
                {preferences.theme === theme.value ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : null}
              </DropdownMenu.Item>
            );
          })}

          <DropdownMenu.Separator className="my-1 h-px bg-subtle" />

          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className={cn(
              'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 outline-none',
              'text-secondary data-[highlighted]:bg-sunken data-[highlighted]:text-primary',
            )}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
