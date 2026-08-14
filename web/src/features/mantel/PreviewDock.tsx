import { Pause, Play, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { FileGlyph } from '@/components/FileGlyph';
import { TrayBar, useTrayIsShared } from '@/features/shell/BottomTray';
import { usePlayback } from './PlaybackProvider';
import type { PreviewItem } from './PreviewProvider';

/**
 * The dock: minimised previews as a labelled strip in the shell's bottom tray,
 * where it stacks with the selection bar rather than landing on top of it.
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
  return (
    <TrayBar slot="dock" show={items.length > 0}>
      <ul
        aria-label="Minimised previews"
        className="flex max-w-full gap-1.5 overflow-x-auto p-1.5"
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
    </TrayBar>
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
  const isShared = useTrayIsShared();
  const isSounding = playback.track?.path === item.id;

  return (
    <li className="shrink-0">
      <div
        className={cn(
          'group flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
          'duration-[var(--duration-instant)]',
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
            {/* Dropped first when the tray is shared: what is playing is
                already audible, and the time beneath says which part of it. */}
            <span
              className={cn(
                'block max-w-[10rem] truncate text-[0.8125rem] text-primary',
                isShared && 'hidden xl:block',
              )}
            >
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

        {/* Always visible, never on hover: this is the only way to stop a track
            that is playing with no window of its own, and a control you have to
            discover by waving the mouse at it is one that does not exist on a
            touch screen at all. */}
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted hover:text-primary"
          onClick={onClose}
          aria-label={`Close preview of ${item.entry.name}`}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}
