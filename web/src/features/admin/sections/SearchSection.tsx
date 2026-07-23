import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/Button';
import { Input, Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';

/**
 * Read-only view of which search backend is answering. There is no rebuild
 * button — Everything owns its own index, and Hearth never builds one.
 */
export function SearchSection() {
  const status = useQuery({ queryKey: ['search-status'], queryFn: () => api.searchStatus(), refetchInterval: 15_000 });
  const [term, setTerm] = useState('');
  const [result, setResult] = useState<{ count: number; ms: number } | null>(null);
  const [isTesting, setTesting] = useState(false);

  async function runTestSearch() {
    setTesting(true);
    const startedAt = performance.now();
    try {
      const response = await api.search({
        q: term, path: '', sort: 'name', direction: 'asc', recursive: true, page: 1, limit: 20,
      });
      setResult({ count: response.total, ms: Math.round(performance.now() - startedAt) });
    } catch {
      setResult(null);
    } finally {
      setTesting(false);
    }
  }

  if (status.isPending) return <div className="flex justify-center py-8"><Spinner /></div>;

  const health = status.data;

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-subtle p-3">
        <div className="flex items-center gap-2">
          <span
            className={cn('h-2 w-2 rounded-full', health?.healthy ? 'bg-[--color-success]' : 'bg-[--color-danger]')}
            aria-hidden
          />
          <span className="text-sm font-medium text-primary">
            Answering with {health?.provider === 'everything' ? 'Everything' : 'a filesystem walk'}
          </span>
        </div>

        {health?.fallbackActive ? (
          <p className="mt-2 text-xs text-muted">
            Everything is unreachable, so search has fallen back to walking the filesystem.
            Results are still correct, but slower on a large tree.
          </p>
        ) : null}

        <dl className="mt-3 space-y-1 text-xs">
          <Row label="Everything URL" value={health?.everything.url ?? '—'} />
          <Row label="Reachable" value={health?.everything.reachable ? 'Yes' : 'No'} />
          <Row label="Last probe" value={health?.everything.lastProbeAt ? new Date(health.everything.lastProbeAt).toLocaleTimeString() : '—'} />
          <Row label="Latency" value={health?.everything.lastLatencyMs != null ? `${health.everything.lastLatencyMs} ms` : '—'} />
        </dl>

        {health?.note ? <p className="mt-2 font-mono text-[0.6875rem] text-muted">{health.note}</p> : null}
      </div>

      <div>
        <p className="eyebrow mb-2">Test search</p>
        <div className="flex gap-2">
          <Input value={term} onChange={event => setTerm(event.target.value)} placeholder="Search term" />
          <Button variant="primary" onClick={() => void runTestSearch()} disabled={isTesting || !term}>
            Run
          </Button>
        </div>
        {result ? (
          <p className="tabular mt-2 text-xs text-muted">
            {result.count} result(s) in {result.ms} ms
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-secondary">{label}</dt>
      <dd className="truncate font-mono text-muted">{value}</dd>
    </div>
  );
}
