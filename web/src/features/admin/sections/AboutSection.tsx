import { useQuery } from '@tanstack/react-query';

import { HearthMark } from '@/components/brand/HearthMark';
import { api } from '@/lib/api';
import { formatDuration } from '@/lib/format';

export function AboutSection() {
  const { data: version } = useQuery({ queryKey: ['version'], queryFn: () => api.roots() });
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => (await fetch(new URL('system/health', location.href))).json() as Promise<{ uptimeSeconds: number }>,
    retry: false,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <HearthMark className="h-10 w-10 text-primary" />
        <div>
          <p className="text-base font-semibold lowercase">hearth</p>
          <p className="text-sm text-muted">Your files, at home.</p>
        </div>
      </div>

      <dl className="space-y-1.5 text-sm">
        <Row label="Version" value="1.0.0" />
        <Row label="Configured roots" value={String(version?.roots.length ?? '—')} />
        {health ? <Row label="Server uptime" value={formatDuration(health.uptimeSeconds)} /> : null}
      </dl>

      <p className="text-xs leading-relaxed text-muted">
        Hearth serves files from a machine you own. It is not a sync service and not a
        backup — the storage stays where it is, and the network only carries a view of it.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-secondary">{label}</dt>
      <dd className="tabular text-primary">{value}</dd>
    </div>
  );
}
