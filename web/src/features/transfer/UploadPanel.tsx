import { AlertCircle, Check, Upload, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';
import { formatSize } from '@/lib/format';
import type { UploadJob } from './useUploads';

/**
 * Upload progress, docked bottom-left so it never covers the preview dock.
 * Shows the overall figure first — that is what someone waiting actually wants
 * — with per-file detail below it.
 */
export function UploadPanel({
  jobs,
  overallProgress,
  activeCount,
  onCancel,
  onDismiss,
}: {
  jobs: UploadJob[];
  overallProgress: number;
  activeCount: number;
  onCancel: (id: string) => void;
  onDismiss: () => void;
}) {
  if (jobs.length === 0) return null;

  const failedCount = jobs.filter(job => job.status === 'failed').length;

  return (
    <section
      aria-label="Uploads"
      className={cn(
        'absolute bottom-3 left-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden',
        'rounded-xl border border-subtle bg-overlay shadow-lg',
      )}
    >
      <header className="flex items-center gap-2 border-b border-subtle px-3 py-2">
        <Upload className="h-4 w-4 text-muted" />
        <span className="flex-1 text-[0.8125rem] font-medium text-primary">
          {activeCount > 0
            ? `Uploading ${activeCount} file${activeCount === 1 ? '' : 's'}`
            : failedCount > 0
              ? `${failedCount} upload${failedCount === 1 ? '' : 's'} failed`
              : 'Uploads complete'}
        </span>
        <span className="tabular text-xs text-muted">{Math.round(overallProgress * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDismiss} aria-label="Dismiss uploads">
          <X className="h-3.5 w-3.5" />
        </Button>
      </header>

      <div
        role="progressbar"
        aria-valuenow={Math.round(overallProgress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-0.5 bg-sunken"
      >
        <div
          className="h-full bg-accent transition-[width] duration-[--duration-quick]"
          style={{ width: `${overallProgress * 100}%` }}
        />
      </div>

      <ul className="max-h-56 overflow-y-auto p-1.5">
        {jobs.map(job => (
          <li key={job.id} className="flex items-center gap-2 rounded px-1.5 py-1.5">
            <StatusIcon status={job.status} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-primary" title={job.relativePath}>
                {job.relativePath}
              </p>
              <p className="tabular text-[0.6875rem] text-muted">
                {job.status === 'failed'
                  ? (job.error ?? 'Failed')
                  : `${formatSize(job.uploadedBytes)} / ${formatSize(job.size)}`}
              </p>
            </div>
            {job.status === 'uploading' || job.status === 'queued' ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => onCancel(job.id)}
                aria-label={`Cancel upload of ${job.relativePath}`}
              >
                <X className="h-3 w-3" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusIcon({ status }: { status: UploadJob['status'] }) {
  if (status === 'done') return <Check className="h-3.5 w-3.5 shrink-0 text-[--color-success]" />;
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[--color-danger]" />;
  if (status === 'cancelled') return <X className="h-3.5 w-3.5 shrink-0 text-muted" />;
  return (
    <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-strong border-t-accent" />
  );
}

/** Full-window drop target, shown only while a drag is over the app. */
export function DropOverlay({ isActive }: { isActive: boolean }) {
  if (!isActive) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-[--scrim] p-8">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-accent bg-overlay px-10 py-8">
        <Upload className="h-8 w-8 text-accent" />
        <p className="text-sm font-medium text-primary">Drop to upload here</p>
        <p className="text-xs text-muted">Folders keep their structure</p>
      </div>
    </div>
  );
}
