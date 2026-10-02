import { useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Info, Palette, Search, Shield, Trash2, Users, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useSession } from '@/features/session/session';
import { Button } from '@/ui/Button';
import { AboutSection } from './AboutSection';
import { AppearanceSection } from './AppearanceSection';
import { AccessSection } from './AccessSection';
import { SearchSection } from './SearchSection';
import { TrashSection } from './TrashSection';
import { UsersSection } from './UsersSection';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  admin?: boolean;
  render: () => React.ReactNode;
}

const TABS: Tab[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette, render: () => <AppearanceSection /> },
  { id: 'trash', label: 'Recycle bin', icon: Trash2, render: () => <TrashSection /> },
  { id: 'users', label: 'Users', icon: Users, admin: true, render: () => <UsersSection /> },
  {
    id: 'access',
    label: 'Access & viewers',
    icon: Shield,
    admin: true,
    render: () => <AccessSection />,
  },
  { id: 'search', label: 'Search', icon: Search, render: () => <SearchSection /> },
  { id: 'about', label: 'About', icon: Info, render: () => <AboutSection /> },
];

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useSession();
  const tabs = TABS.filter(tab => !tab.admin || can('admin'));
  const [current, setCurrent] = useState('appearance');
  const tab = tabs.find(candidate => candidate.id === current) ?? tabs[0]!;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-fade-out" />
        <RadixDialog.Content className="animate-rise data-[state=closed]:animate-sink fixed inset-0 z-50 flex flex-col bg-bg outline-none md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(40rem,86vh)] md:w-[min(56rem,92vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:overflow-hidden md:rounded-2xl md:border md:border-line md:shadow-float">
          <RadixDialog.Description className="sr-only">
            Preferences and administration
          </RadixDialog.Description>
          <div className="flex shrink-0 flex-col border-line md:w-56 md:border-r md:bg-surface">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <RadixDialog.Title className="display-title text-[28px]">Settings</RadixDialog.Title>
              <RadixDialog.Close asChild>
                <Button size="icon" aria-label="Close" className="md:hidden">
                  <X />
                </Button>
              </RadixDialog.Close>
            </div>
            <nav className="flex gap-1 overflow-x-auto border-b border-line px-3 pb-3 [scrollbar-width:none] md:flex-col md:overflow-visible md:border-b-0">
              {tabs.map(item => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={event => {
                      setCurrent(item.id);
                      // On a phone the tabs are a scrolling row; bring the chosen one fully in.
                      event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'center' });
                    }}
                    aria-current={item.id === tab.id ? 'page' : undefined}
                    className={cn(
                      'flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[13.5px] [&_svg]:size-4',
                      item.id === tab.id
                        ? 'bg-glaze-wash font-medium text-glaze-strong'
                        : 'text-ink-2 hover:bg-sunken hover:text-ink',
                    )}
                  >
                    <Icon />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>
          <div className="scroll-thin relative min-h-0 flex-1 overflow-auto px-5 pb-8 pt-5 md:px-8">
            <RadixDialog.Close asChild>
              <Button
                size="icon"
                aria-label="Close"
                className="absolute right-3 top-3 hidden md:inline-flex"
              >
                <X />
              </Button>
            </RadixDialog.Close>
            <h2 className="mb-4 text-[20px] font-semibold">{tab.label}</h2>
            {tab.render()}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
