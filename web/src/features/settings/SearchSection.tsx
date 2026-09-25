import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatWhen } from '@/lib/format';
import { Spinner } from '@/ui/Feedback';

export function SearchSection() {
  const status = useQuery({
    queryKey: ['search-status'],
    queryFn: () => api.searchStatus(),
    refetchInterval: 15_000,
  });
  if (!status.data) return <Spinner />;
  const { provider, everything, fallbackActive, note } = status.data;

  return (
    <div className="max-w-prose text-[13.5px]">
      <p className="flex items-center gap-2">
        <span
          className={cn('size-2 rounded-full', provider === 'everything' ? 'bg-glaze' : 'bg-ember')}
        />
        {provider === 'everything'
          ? 'Searching with Everything: instant, straight from the drive’s index.'
          : 'Searching by walking the folders: slower on large trees, but always available.'}
      </p>
      {fallbackActive ? (
        <p className="mt-3 rounded-lg bg-sunken px-3 py-2 text-ink-2">
          Everything at {everything.url} is not answering{note ? ` (${note})` : ''}. Start
          Everything with its HTTP server on that address to get instant search back; Hearth
          switches over by itself.
        </p>
      ) : null}
      <dl className="mt-4 grid grid-cols-[9rem_1fr] gap-y-2 text-[13px]">
        <dt className="text-ink-3">Everything</dt>
        <dd>
          {everything.reachable
            ? `reachable${everything.lastLatencyMs !== null ? `, ${everything.lastLatencyMs} ms` : ''}`
            : 'not reachable'}
        </dd>
        <dt className="text-ink-3">Address</dt>
        <dd className="break-all">{everything.url}</dd>
        <dt className="text-ink-3">Last checked</dt>
        <dd>{everything.lastProbeAt ? formatWhen(everything.lastProbeAt) : '—'}</dd>
      </dl>
    </div>
  );
}
