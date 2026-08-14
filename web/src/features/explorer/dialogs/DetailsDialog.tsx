import { useQuery } from '@tanstack/react-query';
import type { FileEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { formatDuration, formatKind, formatSize, formatWhen } from '@/lib/format';
import { viewerKindFor } from '@/features/mantel/viewerFor';
import { DialogShell } from './dialogs';

/**
 * Everything known about one file.
 *
 * The cheap facts — name, path, size, date — come from the listing that is
 * already in hand. The expensive ones are asked for only when this is open, and
 * only for kinds that have them: a duration and codec list for media, a page
 * count for a comic. Nothing here is fetched to draw a row.
 */
export function DetailsDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: FileEntry | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <DialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Details"
      footer={
        <Button onClick={() => onOpenChange(false)} autoFocus>
          Close
        </Button>
      }
    >
      {entry ? <Details entry={entry} /> : null}
    </DialogShell>
  );
}

function Details({ entry }: { entry: FileEntry }) {
  const kind = viewerKindFor(entry);
  const isMedia = kind === 'video' || kind === 'audio';

  const probe = useQuery({
    queryKey: ['probe', entry.path],
    queryFn: ({ signal }) => api.probe(entry.path, signal),
    enabled: isMedia,
    retry: false,
    staleTime: Infinity,
  });

  const comic = useQuery({
    queryKey: ['comic', entry.path],
    queryFn: ({ signal }) => api.openComic(entry.path, signal),
    enabled: kind === 'comic',
    retry: false,
    staleTime: Infinity,
  });

  return (
    <dl className="grid grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
      <Row label="Name">
        <span className="break-words text-primary">{entry.name}</span>
      </Row>

      <Row label="Where">
        <span className="break-all font-mono text-xs text-secondary">
          {parentOf(entry.path) || 'Home'}
        </span>
      </Row>

      <Row label="Kind">{formatKind(entry)}</Row>

      {entry.isDirectory ? null : (
        <Row label="Size">
          <span className="tabular">
            {formatSize(entry.size)}
            {/* The exact count matters when comparing two copies of a file. */}
            <span className="ml-2 text-muted">({entry.size.toLocaleString()} bytes)</span>
          </span>
        </Row>
      )}

      <Row label="Modified">
        <span className="tabular">{formatWhen(entry.mtime)}</span>
        <span className="ml-2 font-mono text-[0.6875rem] text-muted">
          {new Date(entry.mtime).toLocaleString()}
        </span>
      </Row>

      {isMedia ? (
        probe.isPending ? (
          <Row label="Media">
            <Spinner className="h-4 w-4" />
          </Row>
        ) : probe.data ? (
          <>
            {probe.data.durationSeconds ? (
              <Row label="Duration">
                <span className="tabular">{formatDuration(probe.data.durationSeconds)}</span>
              </Row>
            ) : null}
            {probe.data.width && probe.data.height ? (
              <Row label="Dimensions">
                <span className="tabular">
                  {probe.data.width} × {probe.data.height}
                </span>
              </Row>
            ) : null}
            {probe.data.videoCodec || probe.data.audioCodec ? (
              <Row label="Codecs">
                {[probe.data.videoCodec, probe.data.audioCodec].filter(Boolean).join(' · ')}
              </Row>
            ) : null}
            {probe.data.audioTracks.length > 1 || probe.data.subtitleTracks.length > 0 ? (
              <Row label="Tracks">
                {probe.data.audioTracks.length} audio · {probe.data.subtitleTracks.length} subtitle
              </Row>
            ) : null}
            <Row label="Playback">
              {probe.data.browserPlayable ? 'Plays directly' : 'Needs transcoding'}
            </Row>
          </>
        ) : (
          <Row label="Media">
            <span className="text-muted">Could not be read</span>
          </Row>
        )
      ) : null}

      {kind === 'comic' && comic.data ? (
        <Row label="Pages">
          <span className="tabular">{comic.data.pageCount}</span>
        </Row>
      ) : null}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 text-secondary">{children}</dd>
    </>
  );
}

function parentOf(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index === -1 ? '' : path.slice(0, index);
}
