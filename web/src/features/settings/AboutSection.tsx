import { useQuery } from '@tanstack/react-query';

import { LogoMark } from '@/brand/Logo';
import { api } from '@/lib/api';
import { Kbd } from '@/ui/Feedback';

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
    <div>
      <div className="flex items-center gap-4">
        <LogoMark className="size-14" />
        <div>
          <p className="display-title text-[34px]">hearth</p>
          <p className="text-[13px] text-ink-3">
            Version {version.data?.version ?? '…'}. Your files, at home.
          </p>
        </div>
      </div>
      <h3 className="mb-2 mt-8 text-[14px] font-semibold">Keyboard</h3>
      <dl className="grid max-w-md grid-cols-[9rem_1fr] gap-y-2 text-[13px]">
        {SHORTCUTS.map(([keys, action]) => (
          <div key={keys} className="contents">
            <dt>
              <Kbd>{keys}</Kbd>
            </dt>
            <dd className="text-ink-2">{action}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
