import { useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';
import {
  Music,
  Pause,
  Play,
  Repeat,
  Repeat1,
  Shuffle,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { usePlayback } from '../PlaybackProvider';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

const PLAYLIST_ROW_HEIGHT = 40;

/**
 * Audio playback UI. The element itself lives in `PlaybackProvider` above the
 * overlay, so this component is only controls — closing it stops nothing, which
 * is what lets a pinned album keep playing while browsing.
 */
export default function AudioViewer({ item, onStep, ...chrome }: ViewerProps) {
  const playback = usePlayback();

  // Compact when shown as a panel and not expanded: the layout stacks and the
  // playlist scrolls within a bounded height rather than filling the screen.
  const compact = chrome.onToggleExpand != null && !chrome.isExpanded;

  const playlist = useMemo(
    () => item.gallery.filter(entry => entry.mimeType.startsWith('audio/')),
    [item.gallery],
  );

  // Opening a preview starts its track; re-opening one already playing does not
  // restart it.
  useEffect(() => {
    if (playback.track?.path !== item.entry.path) {
      playback.play(item.entry, playlist.length > 0 ? playlist : [item.entry]);
    }
    // Only a change of previewed file should start a track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.entry.path]);

  const isCurrent = playback.track?.path === item.entry.path;
  const position = isCurrent ? playback.positionSeconds : 0;
  const duration = isCurrent ? playback.durationSeconds : 0;

  return (
    <ViewerChrome item={item} onStep={onStep} {...chrome}>
      <div
        className={cn(
          'flex min-h-0 flex-col bg-surface',
          compact ? 'h-full' : 'h-full md:flex-row',
        )}
      >
        <section
          className={cn(
            'flex flex-col items-center justify-center gap-6 p-6',
            compact ? 'shrink-0' : 'md:flex-1',
          )}
        >
          <div
            className={cn(
              'flex items-center justify-center rounded-xl border border-subtle',
              'bg-sunken text-muted transition-shadow duration-[--duration-quick]',
              compact ? 'h-28 w-28' : 'h-40 w-40',
              playback.isPlaying && isCurrent && 'border-accent/40 shadow-[0_0_28px_var(--accent-wash)]',
            )}
          >
            <Music className={compact ? 'h-10 w-10' : 'h-14 w-14'} />
          </div>

          <div className="w-full max-w-md text-center">
            <p className="truncate text-base font-medium text-primary">{item.entry.name}</p>

            <div className="mt-4 flex items-center gap-2">
              <span className="tabular w-11 text-right text-xs text-muted">
                {formatDuration(position)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={position}
                onChange={event => playback.seek(Number(event.target.value))}
                aria-label="Seek"
                className="h-1 flex-1 cursor-pointer accent-[var(--accent)]"
              />
              <span className="tabular w-11 text-xs text-muted">{formatDuration(duration)}</span>
            </div>

            <div className="mt-4 flex items-center justify-center gap-1">
              <Tooltip label={playback.shuffle ? 'Shuffle on' : 'Shuffle off'}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={playback.toggleShuffle}
                  aria-pressed={playback.shuffle}
                  aria-label="Shuffle"
                  className={cn(playback.shuffle && 'text-accent')}
                >
                  <Shuffle className="h-4 w-4" />
                </Button>
              </Tooltip>

              <Button variant="ghost" size="icon" onClick={() => playback.skip(-1)} aria-label="Previous track">
                <SkipBack className="h-5 w-5" />
              </Button>

              <Button variant="primary" size="icon" onClick={playback.toggle} aria-label={playback.isPlaying ? 'Pause' : 'Play'} className="h-11 w-11 rounded-full">
                {playback.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>

              <Button variant="ghost" size="icon" onClick={() => playback.skip(1)} aria-label="Next track">
                <SkipForward className="h-5 w-5" />
              </Button>

              <Tooltip label={`Repeat: ${playback.repeat}`}>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={playback.cycleRepeat}
                  aria-label={`Repeat ${playback.repeat}`}
                  className={cn(playback.repeat !== 'off' && 'text-accent')}
                >
                  {playback.repeat === 'one' ? (
                    <Repeat1 className="h-4 w-4" />
                  ) : (
                    <Repeat className="h-4 w-4" />
                  )}
                </Button>
              </Tooltip>
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              <Button variant="ghost" size="icon" onClick={playback.toggleMute} aria-label="Mute">
                {playback.muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={playback.muted ? 0 : playback.volume}
                onChange={event => playback.setVolume(Number(event.target.value))}
                aria-label="Volume"
                className="h-1 w-28 cursor-pointer accent-[var(--accent)]"
              />
            </div>
          </div>
        </section>

        {playlist.length > 1 ? <Playlist entries={playlist} compact={compact} /> : null}
      </div>
    </ViewerChrome>
  );
}

/** Virtualised, because a music folder can hold thousands of tracks. */
function Playlist({ entries, compact }: { entries: FileEntry[]; compact: boolean }) {
  const playback = usePlayback();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => PLAYLIST_ROW_HEIGHT,
    overscan: 12,
  });

  return (
    <aside
      className={cn(
        'flex min-h-0 flex-col border-t border-subtle',
        // A compact panel may be auto-height, so the list is bounded here to
        // scroll internally; the full layout puts it in a side column.
        compact ? 'w-full' : 'w-full md:w-80 md:border-l md:border-t-0',
      )}
    >
      <h3 className="eyebrow border-b border-subtle px-3 py-2">
        Playlist · {entries.length} tracks
      </h3>
      <div
        ref={scrollRef}
        className={cn('min-h-0 overflow-y-auto', compact ? 'max-h-56' : 'flex-1')}
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map(row => {
            const entry = entries[row.index]!;
            const isCurrent = playback.track?.path === entry.path;
            return (
              <button
                key={entry.path}
                type="button"
                onClick={() => playback.play(entry, entries)}
                className={cn(
                  'absolute inset-x-0 flex items-center gap-2 px-3 text-left text-[0.8125rem]',
                  'hover:bg-sunken',
                  isCurrent ? 'text-accent' : 'text-secondary',
                )}
                style={{ height: row.size, transform: `translateY(${row.start}px)` }}
              >
                <span className="tabular w-6 shrink-0 text-xs text-muted">{row.index + 1}</span>
                <span className="truncate">{entry.name}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
