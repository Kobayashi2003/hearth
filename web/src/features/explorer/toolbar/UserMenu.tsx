import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, LogOut, Monitor, Moon, Sun, User } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { menuContentClass, menuItemClass, menuSeparatorClass } from '@/components/ui/Menu';
import { useSession } from '@/features/auth/SessionProvider';
import { useShell } from '@/features/shell/AppShell';
import type { Theme } from '@/features/hob/usePreferences';

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
          className={`${menuContentClass} min-w-52`}
        >
          <div className="px-2 py-1.5">
            <p className="truncate font-medium text-primary">{identity?.username}</p>
            <p className="font-mono text-[0.6875rem] text-muted">
              {identity?.actions.join(' · ') || 'no permissions'}
            </p>
          </div>

          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.Label className="eyebrow px-2 py-1">Appearance</DropdownMenu.Label>

          {THEMES.map(theme => {
            const Icon = theme.icon;
            return (
              <DropdownMenu.Item
                key={theme.value}
                onSelect={() => updatePreference('theme', theme.value)}
                className={menuItemClass}
              >
                <Icon className="h-4 w-4" />
                <span className="flex-1">{theme.label}</span>
                {preferences.theme === theme.value ? (
                  <Check className="h-4 w-4 text-accent" />
                ) : null}
              </DropdownMenu.Item>
            );
          })}

          <DropdownMenu.Separator className={menuSeparatorClass} />

          <DropdownMenu.Item
            onSelect={() => void signOut()}
            className={menuItemClass}
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
