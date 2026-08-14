import {
  FastForward,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Rewind,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { VideoPlaybackState } from './useVideoPlayback';

const SKIP_SECONDS = 10;

export function VideoControls({
  state,
  onToggle,
  onSeek,
  onSeekBy,
  onStepFile,
  onVolume,
  onToggleMute,
  isFull,
  onFullscreen,
  onPictureInPicture,
  extras,
  visible,
}: {
  state: VideoPlaybackState;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onSeekBy: (delta: number) => void;
  /**
   * Previous/next *file*, not previous/next ten seconds. Absent when the folder
   * holds nothing else to step to. It belongs here rather than floating over
   * the picture: an arrow that changes the film should not sit a thumb's width
   * from the one that changes the minute.
   */
  onStepFile?: ((delta: number) => void) | undefined;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  /** The window's fullness — the transport and the header share one state. */
  isFull: boolean;
  onFullscreen: () => void;
  onPictureInPicture: () => void;
  /** Track and settings menus, which live beside the volume control. */
  extras?: React.ReactNode;
  visible: boolean;
}) {
  const duration = state.durationSeconds || 0;

  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/85 to-transparent',
        'px-3 pb-2 pt-8 transition-opacity duration-[var(--duration-quick)]',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <Scrubber
        position={state.positionSeconds}
        buffered={state.bufferedSeconds}
        duration={duration}
        onSeek={onSeek}
      />

      {/* Three clusters, read left to right: what is playing, where in the file,
          where in the folder. Tight inside a cluster, loose between them — the
          spacing is what tells you which buttons belong together. */}
      <div className="mt-1 flex items-center gap-2 text-white">
        <ControlButton label={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={onToggle}>
          {state.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </ControlButton>

        <div className="flex items-center gap-0.5">
          <ControlButton label={`Back ${SKIP_SECONDS}s (←)`} onClick={() => onSeekBy(-SKIP_SECONDS)}>
            <Rewind className="h-4 w-4" />
          </ControlButton>

          <ControlButton label={`Forward ${SKIP_SECONDS}s (→)`} onClick={() => onSeekBy(SKIP_SECONDS)}>
            <FastForward className="h-4 w-4" />
          </ControlButton>
        </div>

        {onStepFile ? (
          // Divided off, because the cost of a mis-click here is losing your
          // place in the file rather than ten seconds of it.
          <>
            <span aria-hidden className="h-6 w-px shrink-0 bg-white/15" />

            <div className="flex items-center gap-0.5">
              <ControlButton label="Previous file" onClick={() => onStepFile(-1)}>
                <SkipBack className="h-4 w-4" />
              </ControlButton>

              <ControlButton label="Next file" onClick={() => onStepFile(1)}>
                <SkipForward className="h-4 w-4" />
              </ControlButton>
            </div>
          </>
        ) : null}

        <span className="tabular shrink-0 whitespace-nowrap text-xs text-white/85">
          {formatDuration(state.positionSeconds)}
          <span className="mx-1 text-white/40">/</span>
          <span className="text-white/60">{formatDuration(duration)}</span>
        </span>

        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <div className="group/volume flex items-center">
            <ControlButton label={state.muted ? 'Unmute (M)' : 'Mute (M)'} onClick={onToggleMute}>
              {state.muted || state.volume === 0 ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </ControlButton>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={state.muted ? 0 : state.volume}
              onChange={event => onVolume(Number(event.target.value))}
              aria-label="Volume"
              className={cn(
                'h-1 w-0 cursor-pointer accent-[var(--accent)] opacity-0 transition-all',
                'duration-[var(--duration-quick)] group-hover/volume:w-20 group-hover/volume:opacity-100',
                'focus-visible:w-20 focus-visible:opacity-100',
              )}
            />
          </div>

          {extras}

          <ControlButton label="Picture in picture" onClick={onPictureInPicture}>
            <PictureInPicture2 className="h-4 w-4" />
          </ControlButton>

          <ControlButton
            label={isFull ? 'Leave fullscreen (F)' : 'Fullscreen (F)'}
            onClick={onFullscreen}
          >
            {isFull ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </ControlButton>
        </div>
      </div>
    </div>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-label={label}
        className="text-white hover:bg-white/15 hover:text-white"
      >
        {children}
      </Button>
    </Tooltip>
  );
}

/** Seek bar showing buffered ahead of played, with a full-width hit area. */
function Scrubber({
  position,
  buffered,
  duration,
  onSeek,
}: {
  position: number;
  buffered: number;
  duration: number;
  onSeek: (seconds: number) => void;
}) {
  // Clamped, because the numbers arrive from three places that disagree: the
  // element's own clock, the probe's duration, and a transcode offset added on
  // top. A stray value should shorten a bar, never send it off the end.
  const percent = (value: number) =>
    duration > 0 ? Math.max(0, Math.min(100, (value / duration) * 100)) : 0;
  // Everything played has by definition been fetched, whatever the ranges say.
  const bufferedPercent = Math.max(percent(buffered), percent(position));

  return (
    <div className="group/scrub relative flex h-4 w-full items-center">
      <div className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/25">
        <div className="h-full bg-white/35" style={{ width: `${bufferedPercent}%` }} />
      </div>
      <div
        className="pointer-events-none absolute left-0 h-1 rounded-full bg-[var(--accent)]"
        style={{ width: `${percent(position)}%` }}
      />
      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={position}
        onChange={event => onSeek(Number(event.target.value))}
        aria-label="Seek"
        className="absolute inset-x-0 h-4 w-full cursor-pointer opacity-0"
      />
    </div>
  );
}
