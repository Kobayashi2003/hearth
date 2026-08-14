import { useEffect, useMemo, useRef } from 'react';
import {
  ListMusic,
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

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { usePlayback } from '../PlaybackProvider';
import { AlbumArt } from './audio/AlbumArt';
import { Playlist } from './audio/Playlist';
import { useVisualiser } from './audio/useVisualiser';
import { ViewerChrome } from '../ViewerChrome';
import type { ViewerProps } from './types';

/**
 * Audiobooks and podcasts want to go faster; music rarely wants to go slower,
 * so the cycle is weighted upwards and wraps back to 1 rather than crawling.
 */
const RATES = [1, 1.25, 1.5, 1.75, 2, 0.75] as const;

function nextRate(current: number): number {
  const index = RATES.indexOf(current as (typeof RATES)[number]);
  return RATES[(index + 1) % RATES.length] ?? 1;
}

/** The bars are drawn on a canvas, which cannot read a CSS custom property. */
function accentColour(): string {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d2570f';
}

/**
 * Audio playback UI. The element itself lives in `PlaybackProvider` above the
 * overlay, so this component is only controls — closing it stops nothing, which
 * is what lets a pinned album keep playing while browsing.
 */
export default function AudioViewer({ item, onStep, ...chrome }: ViewerProps) {
  const playback = usePlayback();

  // Compact when the window is still the content-sized card: the layout stacks
  // and the playlist scrolls within a bounded height rather than filling the
  // screen.
  const compact = chrome.isCompact;

  const playlist = useMemo(
    () => item.gallery.filter(entry => entry.mimeType.startsWith('audio/')),
    [item.gallery],
  );
  const hasPlaylist = playlist.length > 1;
  const playlistOpen = playback.playlistVisible;

  // Opening a preview starts its track; re-opening one already playing does not
  // restart it.
  useEffect(() => {
    if (playback.track?.path !== item.entry.path) {
      playback.play(item.entry, playlist.length > 0 ? playlist : [item.entry]);
    }
    // Only a change of previewed file should start a track.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.entry.path]);

  /**
   * The playlist advancing is a navigation, so the preview follows it — or the
   * viewer keeps describing the track that just finished.
   *
   * Only a *change* counts, never the value present at mount: opening a second
   * song while the first still played would otherwise step the new preview
   * backwards onto the old one.
   */
  const followedTrack = useRef(playback.track?.path);
  useEffect(() => {
    const playing = playback.track?.path;
    const previous = followedTrack.current;
    followedTrack.current = playing;

    if (!playing || playing === previous || playing === item.entry.path || !onStep) return;
    const from = item.gallery.findIndex(entry => entry.path === item.entry.path);
    const to = item.gallery.findIndex(entry => entry.path === playing);
    if (from === -1 || to === -1) return;
    onStep(to - from);
    // Only a change of playing track is a reason to move the preview.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playback.track?.path]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isCurrent = playback.track?.path === item.entry.path;
  const position = isCurrent ? playback.positionSeconds : 0;
  const duration = isCurrent ? playback.durationSeconds : 0;

  useVisualiser(canvasRef, playback.audioElement, playback.isPlaying && isCurrent, accentColour());

  return (
    <ViewerChrome
      item={item}
      onStep={onStep}
      // Never immersive: there is no picture to get out of the way of, and a
      // player whose header retreats is a player you cannot close.
      flow="document"
      controls={
        <div className="flex items-center gap-0.5">
          {hasPlaylist ? (
            <Tooltip label={playlistOpen ? 'Hide playlist' : 'Show playlist'}>
              <Button
                variant="ghost"
                size="icon"
                onClick={playback.togglePlaylist}
                aria-pressed={playlistOpen}
                aria-label="Playlist"
                className={cn(playlistOpen && 'text-accent')}
              >
                <ListMusic className="h-4 w-4" />
              </Button>
            </Tooltip>
          ) : null}

          <Tooltip label="Playback speed">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => playback.setRate(nextRate(playback.rate))}
              aria-label={`Playback speed ${playback.rate}x`}
              className={cn('tabular w-12', playback.rate !== 1 && 'text-accent')}
            >
              {playback.rate}×
            </Button>
          </Tooltip>
        </div>
      }
      {...chrome}
    >
      <div className="flex h-full min-h-0 flex-row bg-surface">
        <section className="flex min-w-0 flex-1 flex-col items-center justify-center p-6">
          {/* One column, one measure: cover, title and controls share a width, so
              the player reads as a single stack rather than a small square over a
              wider set of bars. */}
          <div
            className={cn(
              'flex w-full flex-col items-center',
              compact ? 'max-w-[16rem]' : 'max-w-[20rem]',
            )}
          >
            {/* Four fifths: edge to edge, the cover dominates the panel and
                pushes the transport off a short window. */}
            <AlbumArt
              path={item.entry.path}
              className={cn(
                'w-4/5 transition-shadow duration-[var(--duration-quick)]',
                playback.isPlaying &&
                  isCurrent &&
                  'shadow-[0_0_34px_var(--accent-wash)] ring-1 ring-accent/40',
              )}
            />

            {/* Sits under the cover rather than over it: the artwork is the
                thing worth looking at, the bars are only evidence of sound. */}
            <canvas
              ref={canvasRef}
              width={240}
              height={40}
              aria-hidden
              className={cn(
                'mt-2 h-6 w-full transition-opacity duration-[var(--duration-quick)]',
                playback.isPlaying && isCurrent ? 'opacity-70' : 'opacity-0',
              )}
            />

            <div className="mt-2 w-full text-center">
              <p
                className="truncate text-[0.9375rem] font-medium text-primary"
                title={item.entry.name}
              >
                {item.entry.name}
              </p>

              <div className="mt-3 flex items-center gap-2">
                <span className="tabular w-10 text-right text-[0.6875rem] text-muted">
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
                <span className="tabular w-10 text-[0.6875rem] text-muted">
                  {formatDuration(duration)}
                </span>
              </div>

              {/* Balanced on the play button, which sits on the centre line. */}
              <div className="mt-3 flex items-center justify-center gap-1">
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

              {/* Volume alone down here, centred like everything above it; the
                  playlist and the speed live in the header. */}
              <div className="mt-2 flex items-center justify-center gap-1.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={playback.toggleMute}
                  aria-label="Mute"
                >
                  {playback.muted ? (
                    <VolumeX className="h-4 w-4" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
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
          </div>
        </section>

        {hasPlaylist && playlistOpen ? (
          <Playlist entries={playlist} compact={compact} onClose={playback.togglePlaylist} />
        ) : null}
      </div>
    </ViewerChrome>
  );
}
