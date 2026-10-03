import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatWhen } from '@/lib/format';
import { Spinner } from '@/ui/Feedback';
import { SettingRow, SettingsGroup } from '@/ui/Field';

export function SearchSection() {
  const status = useQuery({
    queryKey: ['search-status'],
    queryFn: () => api.searchStatus(),
    refetchInterval: 15_000,
  });
  if (!status.data) return <Spinner />;
  const { provider, everything, fallbackActive, note } = status.data;

  return (
    <>
      <SettingsGroup
        title="How searches run"
        description={
          fallbackActive
            ? 'Everything is not answering. Start it with its HTTP server on the address below to get instant search back; Hearth switches over by itself.'
            : undefined
        }
      >
        <p className="flex items-center gap-2 py-3.5 text-[13.5px]">
          <span
            className={cn(
              'size-2 shrink-0 rounded-full',
              provider === 'everything' ? 'bg-glaze' : 'bg-ember',
            )}
          />
          {provider === 'everything'
            ? 'With Everything: instant, straight from the drive’s index.'
            : 'By walking the folders: slower on large trees, but always available.'}
        </p>
      </SettingsGroup>

      <SettingsGroup title="Everything">
        <SettingRow title="Status">
          <span className="text-[13px] text-ink-2">
            {everything.reachable
              ? `Reachable${everything.lastLatencyMs !== null ? `, ${everything.lastLatencyMs} ms` : ''}`
              : 'Not reachable'}
          </span>
        </SettingRow>
        {note && !everything.reachable ? (
          <SettingRow title="Reason">
            <span className="text-[13px] text-ink-2">{note}</span>
          </SettingRow>
        ) : null}
        <SettingRow title="Address">
          <span className="break-all text-[13px] text-ink-2">{everything.url}</span>
        </SettingRow>
        <SettingRow title="Last checked">
          <span className="text-[13px] text-ink-2">
            {everything.lastProbeAt ? formatWhen(everything.lastProbeAt) : '—'}
          </span>
        </SettingRow>
      </SettingsGroup>
    </>
  );
}
