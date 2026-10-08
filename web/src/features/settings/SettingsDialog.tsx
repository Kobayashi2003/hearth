import { Fragment, useState } from 'react';
import * as RadixDialog from '@radix-ui/react-dialog';
import {
  ChevronLeft,
  ChevronRight,
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

import { useMediaQuery } from '@/hooks/useMediaQuery';
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
  // A phone shows the sections as a list first, then one section as a page of its own.
  const stacked = !useMediaQuery('(min-width: 768px)');
  const [current, setCurrent] = useState<string | null>('appearance');
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && stacked) setCurrent(null);
  }
  const all = groups.flatMap(([group, tabs]) => tabs.map(tab => ({ group, tab })));
  const chosen = all.find(entry => entry.tab.id === current);
  const showList = stacked && !chosen;
  const { group, tab } = chosen ?? all[0]!;

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-fade fixed inset-0 z-50 bg-[var(--scrim)] data-[state=closed]:animate-fade-out" />
        <RadixDialog.Content className="animate-rise data-[state=closed]:animate-sink fixed inset-0 z-50 flex flex-col bg-bg pt-[var(--safe-top)] pr-[var(--safe-right)] pl-[var(--safe-left)] outline-none md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(42rem,88vh)] md:w-[min(60rem,94vw)] md:-translate-x-1/2 md:-translate-y-1/2 md:flex-row md:overflow-hidden md:rounded-2xl md:border md:border-line md:p-0 md:shadow-float">
          <RadixDialog.Description className="sr-only">
            Your preferences, and for administrators the settings that apply to everyone
          </RadixDialog.Description>

          {showList ? (
            <SectionList groups={groups} onOpen={setCurrent} />
          ) : (
            <>
              {stacked ? null : <SideNav groups={groups} current={tab.id} onOpen={setCurrent} />}
              <div className="scroll-thin relative min-h-0 flex-1 overflow-auto">
                {stacked ? (
                  <PageBar title={tab.label} onBack={() => setCurrent(null)} />
                ) : (
                  <RadixDialog.Close asChild>
                    <Button size="icon" aria-label="Close" className="absolute right-3 top-3">
                      <X />
                    </Button>
                  </RadixDialog.Close>
                )}
                <div className="mx-auto max-w-[44rem] px-4 pb-[calc(2.5rem+var(--safe-bottom))] pt-3 sm:px-6 md:px-8 md:pt-7">
                  <header className="mb-6 flex flex-wrap items-baseline gap-x-3 gap-y-1 md:pr-10">
                    {stacked ? null : <h2 className="text-[20px] font-semibold">{tab.label}</h2>}
                    {group === 'admin' ? (
                      <span className="inline-flex items-center gap-1 text-[12px] text-ink-3 [&_svg]:size-3.5">
                        <ShieldCheck /> Administrator setting, applies to everyone
                      </span>
                    ) : null}
                  </header>
                  {tab.render()}
                </div>
              </div>
            </>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** The sections down the side of the dialog, from md up. */
function SideNav({
  groups,
  current,
  onOpen,
}: {
  groups: Array<[Group, Tab[]]>;
  current: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-line bg-surface">
      <div className="px-5 pb-2 pt-5">
        <RadixDialog.Title className="display-title text-[28px]">Settings</RadixDialog.Title>
      </div>
      <nav className="flex flex-col gap-1 overflow-y-auto px-3 pb-3">
        {groups.map(([name, tabs], index) => (
          <Fragment key={name}>
            {groups.length > 1 ? (
              <p
                className={cn(
                  'px-3 pb-1 text-[11.5px] font-medium text-ink-3',
                  index > 0 && 'mt-5',
                )}
              >
                {GROUP_LABEL[name]}
              </p>
            ) : null}
            {tabs.map(item => {
              const Icon = item.icon;
              const active = item.id === current;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9 items-center gap-2.5 rounded-lg px-3 text-[13.5px] [&_svg]:size-4',
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
  );
}

/** A phone's first page: every section as a row, grouped, each opening as a page. */
function SectionList({
  groups,
  onOpen,
}: {
  groups: Array<[Group, Tab[]]>;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="scroll-thin min-h-0 flex-1 overflow-auto pb-[calc(1.5rem+var(--safe-bottom))]">
      <div className="flex items-center justify-between px-5 pb-2 pt-4">
        <RadixDialog.Title className="display-title text-[30px]">Settings</RadixDialog.Title>
        <CloseButton />
      </div>
      {groups.map(([name, tabs]) => (
        <section key={name} className="mt-4 px-4">
          {groups.length > 1 ? (
            <h3 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">
              {GROUP_LABEL[name]}
            </h3>
          ) : null}
          <div className="overflow-hidden rounded-2xl border border-line bg-surface">
            {tabs.map((item, index) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpen(item.id)}
                  className={cn(
                    'flex h-13 w-full items-center gap-3 px-4 text-left text-[15px] active:bg-sunken [&>svg:first-child]:size-5 [&>svg:first-child]:text-ink-3',
                    index > 0 && 'border-t border-line',
                  )}
                >
                  <Icon />
                  <span className="flex-1">{item.label}</span>
                  <ChevronRight className="size-4 text-ink-3" />
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

/** A section opened on a phone: back to the list, its name, and close. */
function PageBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="sticky top-0 z-10 flex h-12 items-center gap-1 border-b border-line bg-bg/95 px-2 backdrop-blur">
      <Button size="icon" onClick={onBack} aria-label="All settings">
        <ChevronLeft />
      </Button>
      <RadixDialog.Title className="min-w-0 flex-1 truncate text-[16px] font-semibold">
        {title}
      </RadixDialog.Title>
      <CloseButton />
    </div>
  );
}

function CloseButton() {
  return (
    <RadixDialog.Close asChild>
      <Button size="icon" aria-label="Close">
        <X />
      </Button>
    </RadixDialog.Close>
  );
}
