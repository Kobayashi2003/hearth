import { Pause, Play, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { FileGlyph } from '@/features/explorer/FileGlyph';
import { usePlayback } from './PlaybackProvider';
import type { PreviewItem } from './PreviewProvider';

/**
 * The dock: minimised previews as a labelled strip along the bottom edge.
 *
 * This is the spatial model that makes several open previews comprehensible —
 * a minimised preview is *somewhere*, not gone. Anything playing keeps a live
 * position readout and an ember glow, so the thing making sound is always
 * identifiable at a glance.
 */
export function PreviewDock({
  items,
  onRestore,
  onClose,
}: {
  items: PreviewItem[];
  onRestore: (id: string) => void;
  onClose: (id: string) => void;
}) {
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-40 flex justify-center p-3">
      <ul
        aria-label="Minimised previews"
        className={cn(
          'pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto rounded-xl border',
          'border-subtle bg-overlay/95 p-1.5 shadow-lg backdrop-blur-md',
        )}
      >
        {items.map(item => (
          <DockItem
            key={item.id}
            item={item}
            onRestore={() => onRestore(item.id)}
            onClose={() => onClose(item.id)}
          />
        ))}
      </ul>
    </div>
  );
}

function DockItem({
  item,
  onRestore,
  onClose,
}: {
  item: PreviewItem;
  onRestore: () => void;
  onClose: () => void;
}) {
  const playback = usePlayback();
  const isSounding = playback.track?.path === item.id;

  return (
    <li className="shrink-0">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
          'duration-[--duration-instant]',
          isSounding
            ? 'border-accent/45 bg-accent-wash'
            : 'border-transparent hover:border-subtle hover:bg-sunken',
        )}
      >
        <button
          type="button"
          onClick={onRestore}
          className="flex min-w-0 items-center gap-2 text-left"
          aria-label={`Restore preview of ${item.entry.name}`}
        >
          <span className={cn('shrink-0', isSounding && 'text-accent')}>
            <FileGlyph entry={item.entry} className="h-4 w-4" />
          </span>

          <span className="min-w-0">
            <span className="block max-w-[10rem] truncate text-[0.8125rem] text-primary">
              {item.entry.name}
            </span>
            {isSounding ? (
              <span className="tabular block text-[0.6875rem] text-accent">
                {formatDuration(playback.positionSeconds)} / {formatDuration(playback.durationSeconds)}
              </span>
            ) : null}
          </span>
        </button>

        {isSounding ? (
          <Tooltip label={playback.isPlaying ? 'Pause' : 'Play'}>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-accent"
              onClick={playback.toggle}
              aria-label={playback.isPlaying ? 'Pause' : 'Play'}
            >
              {playback.isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </Button>
          </Tooltip>
        ) : null}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
          onClick={onClose}
          aria-label={`Close preview of ${item.entry.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}
