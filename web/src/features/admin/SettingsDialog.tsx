import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  HardDrive,
  Info,
  Monitor,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { useSession } from '@/features/auth/SessionProvider';
import { AboutSection } from './sections/AboutSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { PermissionsSection } from './sections/PermissionsSection';
import { RootsSection } from './sections/RootsSection';
import { SearchSection } from './sections/SearchSection';
import { TrashSection } from './sections/TrashSection';
import { UsersSection } from './sections/UsersSection';

interface Section {
  id: string;
  label: string;
  icon: typeof Users;
  adminOnly: boolean;
  render: () => React.ReactNode;
}

/**
 * The settings surface, replacing the previous build's single 1,000-line
 * dialog. Each concern is its own section and its own component; the sidebar
 * is what makes them findable.
 */
const SECTIONS: Section[] = [
  { id: 'appearance', label: 'Appearance', icon: Monitor, adminOnly: false, render: () => <AppearanceSection /> },
  { id: 'trash', label: 'Recycle bin', icon: Trash2, adminOnly: false, render: () => <TrashSection /> },
  { id: 'roots', label: 'Roots', icon: HardDrive, adminOnly: true, render: () => <RootsSection /> },
  { id: 'search', label: 'Search', icon: Search, adminOnly: false, render: () => <SearchSection /> },
  { id: 'users', label: 'Users', icon: Users, adminOnly: true, render: () => <UsersSection /> },
  { id: 'permissions', label: 'Permissions', icon: Shield, adminOnly: true, render: () => <PermissionsSection /> },
  { id: 'about', label: 'About', icon: Info, adminOnly: false, render: () => <AboutSection /> },
];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useSession();
  const [activeId, setActiveId] = useState('appearance');

  const available = SECTIONS.filter(section => !section.adminOnly || can('admin'));
  const active = available.find(section => section.id === activeId) ?? available[0]!;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[--scrim]" />
        <Dialog.Content
          className={cn(
            'fixed inset-0 z-50 flex flex-col overflow-hidden border-subtle bg-overlay shadow-2xl',
            'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:h-[min(38rem,calc(100vh-3rem))]',
            'sm:w-[min(52rem,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2',
            'sm:flex-row sm:rounded-xl sm:border',
          )}
        >
          <Dialog.Title className="sr-only">Settings</Dialog.Title>

          {/* A full-screen dialog on a phone has no scrim to tap and no Escape
              key, so a visible close control is essential, not optional. */}
          <div className="flex shrink-0 items-center justify-between border-b border-subtle px-3 py-2.5 sm:hidden">
            <span className="text-base font-semibold text-primary">Settings</span>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close settings">
                <X className="h-4 w-4" />
              </Button>
            </Dialog.Close>
          </div>

          <nav
            aria-label="Settings sections"
            className="flex shrink-0 gap-1 overflow-x-auto border-b border-subtle p-2 sm:w-52 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r"
          >
            {available.map(section => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveId(section.id)}
                  aria-current={active.id === section.id ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-sm',
                    'transition-colors duration-[--duration-instant]',
                    active.id === section.id
                      ? 'bg-accent-wash font-medium text-accent'
                      : 'text-secondary hover:bg-sunken hover:text-primary',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {section.label}
                </button>
              );
            })}
          </nav>

          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-primary">{active.label}</h2>
              {/* Desktop close; the phone layout has its own in the top bar. */}
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close settings" className="hidden sm:flex">
                  <X className="h-4 w-4" />
                </Button>
              </Dialog.Close>
            </div>
            {active.render()}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
