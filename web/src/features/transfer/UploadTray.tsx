import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleAlert, X } from 'lucide-react';

import { cn } from '@/lib/cn';
import { formatSize } from '@/lib/format';
import { Button } from '@/ui/Button';
import type { UploadJob } from './uploads';

export function UploadTray({
  jobs,
  onCancel,
  onClear,
}: {
  jobs: UploadJob[];
  onCancel: (id: string) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(true);
  if (jobs.length === 0) return null;

  const active = jobs.filter(job => job.status === 'queued' || job.status === 'uploading');
  const failed = jobs.filter(job => job.status === 'failed').length;
  const total = jobs.reduce((sum, job) => sum + job.size, 0);
  const sent = jobs.reduce((sum, job) => sum + (job.status === 'done' ? job.size : job.sent), 0);
  const percent = total > 0 ? Math.round((sent / total) * 100) : 100;

  const heading =
    active.length > 0
      ? `Uploading ${active.length} ${active.length === 1 ? 'file' : 'files'}, ${percent}%`
      : failed > 0
        ? `${failed} upload${failed === 1 ? '' : 's'} failed`
        : 'Uploads finished';

  return (
    <section
      aria-label="Uploads"
      className="animate-rise pointer-events-auto w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-float"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <p className="tabular min-w-0 flex-1 truncate text-[13px] font-medium">{heading}</p>
        <Button
          size="icon"
          onClick={() => setOpen(!open)}
          aria-label={open ? 'Collapse' : 'Expand'}
        >
          {open ? <ChevronDown /> : <ChevronUp />}
        </Button>
        {active.length === 0 ? (
          <Button size="icon" onClick={onClear} aria-label="Dismiss">
            <X />
          </Button>
        ) : null}
      </div>
      <div className="h-0.5 bg-sunken">
        <div className="h-full bg-glaze transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      {open ? (
        <ul className="scroll-thin max-h-60 overflow-auto py-1">
          {jobs.map(job => (
            <li key={job.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px]">
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block truncate',
                    job.status === 'cancelled' && 'text-ink-3 line-through',
                  )}
                  title={job.name}
                >
                  {job.name}
                </span>
                <span className="tabular block text-[11.5px] text-ink-3">
                  {job.status === 'failed'
                    ? job.error
                    : `${formatSize(job.status === 'done' ? job.size : job.sent)} of ${formatSize(job.size)}`}
                </span>
              </span>
              {job.status === 'done' ? <Check className="size-4 text-glaze" /> : null}
              {job.status === 'failed' ? <CircleAlert className="size-4 text-danger" /> : null}
              {job.status === 'queued' || job.status === 'uploading' ? (
                <Button
                  size="icon"
                  onClick={() => onCancel(job.id)}
                  aria-label={`Cancel ${job.name}`}
                  className="size-7"
                >
                  <X />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
