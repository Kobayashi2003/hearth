import { Fragment, useEffect, useRef, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import {
  FolderLock,
  Gauge,
  Globe,
  Info,
  Palette,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';
import { useSession } from '@/features/session/session';
import { Button } from '@/ui/Button';
import { AboutSection } from './AboutSection';
import { AppearanceSection } from './AppearanceSection';
import { AccessSection } from './AccessSection';
import { LimitsSection } from './LimitsSection';
import { SearchSection } from './SearchSection';
import { TrashSection } from './TrashSection';
import { UsersSection } from './UsersSection';
import { WebPagesSection } from './WebPagesSection';

type Group = 'you' | 'admin';

interface Tab {
  id: string;
  label: string;
  icon: LucideIcon;
  render: () => React.ReactNode;
}

const GROUP_LABEL: Record<Group, string> = { you: 'You', admin: 'Administration' };

/**
 * Two groups: what each person sets for themselves, and what an administrator
 * sets for everyone. Only administrators see the second. The recycle bin is
 * administration for them; for someone who can only delete, it is the place
 * to restore their deleted items, under "You".
 */
function tabsFor(can: (action: 'delete' | 'admin') => boolean): Array<[Group, Tab[]]> {
  const admin = can('admin');
  const trash: Tab = {
    id: 'trash',
    label: 'Recycle bin',
    icon: Trash2,
    render: () => <TrashSection />,
  };
  const you: Tab[] = [
    { id: 'appearance', label: 'Appearance', icon: Palette, render: () => <AppearanceSection /> },
    ...(!admin && can('delete') ? [trash] : []),
    { id: 'about', label: 'About', icon: Info, render: () => <AboutSection /> },
  ];
  if (!admin) return [['you', you]];
  return [
    ['you', you],
    [
      'admin',
      [
        { id: 'users', label: 'Users', icon: Users, render: () => <UsersSection /> },
        { id: 'access', label: 'Folder access', icon: FolderLock, render: () => <AccessSection /> },
        { id: 'web', label: 'Web pages', icon: Globe, render: () => <WebPagesSection /> },
        trash,
        { id: 'limits', label: 'Limits', icon: Gauge, render: () => <LimitsSection /> },
        { id: 'search', label: 'Search', icon: Search, render: () => <SearchSection /> },
      ],
    ],
  ];
}

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { can } = useSession();
  const groups = tabsFor(can);
  const [current, setCurrent] = useState('appearance');
  const all = groups.flatMap(([group, tabs]) => tabs.map(tab => ({ group, tab })));
  const { group, tab } = all.find(entry => entry.tab.id === current) ?? all[0]!;

  // On a phone the tabs are a scrolling row: keep the open one in view, also when the dialog opens.
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      nav.current
        ?.querySelector('[aria-current="page"]')
        ?.scrollIntoView({ block: 'nearest', inline: 'center' }),
    );
    return () => cancelAnimationFrame(frame);
  }, [open, tab.id]);

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-fade-out" />
        <RadixDialog.Content className="animate-rise data-[state=closed]:animate-sink fixed inset-0 z-50 flex flex-col bg-bg outline-none md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(42rem,88vh)] md:w-[min(60rem,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:overflow-hidden md:rounded-2xl md:border md:border-line md:shadow-float">
          <RadixDialog.Description className="sr-only">
            Your preferences, and for administrators the settings that apply to everyone
          </RadixDialog.Description>

          <div className="flex shrink-0 flex-col border-line md:w-60 md:border-r md:bg-surface">
            <div className="flex items-center justify-between px-5 pb-2 pt-5">
              <RadixDialog.Title className="display-title text-[28px]">Settings</RadixDialog.Title>
              <RadixDialog.Close asChild>
                <Button size="icon" aria-label="Close" className="md:hidden">
                  <X />
                </Button>
              </RadixDialog.Close>
            </div>
            {/* A scrolling row on a phone, a column beside the page from md up. */}
            <nav
              ref={nav}
              className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 pb-3 [scrollbar-width:none] md:flex-col md:items-stretch md:overflow-y-auto md:border-b-0"
            >
              {groups.map(([name, tabs], index) => (
                <Fragment key={name}>
                  {groups.length > 1 ? (
                    <p
                      className={cn(
                        'shrink-0 px-3 text-[11.5px] font-medium text-ink-3 md:pb-1',
                        index > 0 && 'max-md:ml-2 max-md:border-l max-md:border-line md:mt-5',
                      )}
                    >
                      {GROUP_LABEL[name]}
                    </p>
                  ) : null}
                  {tabs.map(item => {
                    const Icon = item.icon;
                    const active = item.id === tab.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setCurrent(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex h-9 shrink-0 items-center gap-2.5 rounded-lg px-3 text-[13.5px] [&_svg]:size-4',
                          active
                            ? 'bg-glaze-wash font-medium text-glaze-strong'
                            : 'text-ink-2 hover:bg-sunken hover:text-ink',
                        )}
                      >
                        <Icon />
                        {item.label}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </nav>
          </div>

          <div className="scroll-thin relative min-h-0 flex-1 overflow-auto">
            <RadixDialog.Close asChild>
              <Button
                size="icon"
                aria-label="Close"
                className="absolute right-3 top-3 hidden md:inline-flex"
              >
                <X />
              </Button>
            </RadixDialog.Close>
            <div className="mx-auto max-w-[44rem] px-4 pb-10 pt-5 sm:px-6 md:px-8 md:pt-7">
              <header className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 md:pr-10">
                <h2 className="text-[20px] font-semibold">{tab.label}</h2>
                {group === 'admin' ? (
                  <span className="inline-flex items-center gap-1 text-[12px] text-ink-3 [&_svg]:size-3.5">
                    <ShieldCheck /> Administrator setting, applies to everyone
                  </span>
                ) : null}
              </header>
              {tab.render()}
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}
