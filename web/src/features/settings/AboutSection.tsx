import { useQuery } from '@tanstack/react-query';

import { LogoMark } from '@/brand/Logo';
import { api } from '@/lib/api';
import { Kbd } from '@/ui/Feedback';
import { SettingsGroup } from '@/ui/Field';

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['Ctrl K', 'All commands'],
  ['/', 'Search this folder'],
  ['↑ ↓ ← →', 'Move; Shift extends the selection'],
  ['Enter', 'Open'],
  ['Backspace', 'Up one folder'],
  ['Space', 'Add or remove from the selection'],
  ['F2', 'Rename'],
  ['Del', 'Delete'],
  ['Ctrl C / X / V', 'Copy, cut, paste'],
  ['Esc', 'Clear the selection, close a preview'],
];

export function AboutSection() {
  const version = useQuery({ queryKey: ['version'], queryFn: () => api.version() });
  return (
    <>
      <SettingsGroup>
        <div className="flex items-center gap-4 py-4">
          <LogoMark className="size-14 shrink-0" />
          <div>
            <p className="display-title text-[34px] leading-none">hearth</p>
            <p className="mt-1 text-[13px] text-ink-3">
              Version {version.data?.version ?? '…'}. Your files, at home.
            </p>
          </div>
        </div>
      </SettingsGroup>
      <SettingsGroup title="Keyboard">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="flex items-center justify-between gap-4 py-2.5 text-[13px]">
            <span className="text-ink-2">{action}</span>
            <Kbd>{keys}</Kbd>
          </div>
        ))}
      </SettingsGroup>
    </>
  );
}
