import {
  Maximize,
  Pause,
  PictureInPicture2,
  Play,
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
  onVolume,
  onToggleMute,
  onFullscreen,
  onPictureInPicture,
  extras,
  visible,
}: {
  state: VideoPlaybackState;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onSeekBy: (delta: number) => void;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
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
        'px-3 pb-2 pt-8 transition-opacity duration-[--duration-quick]',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <Scrubber
        position={state.positionSeconds}
        buffered={state.bufferedSeconds}
        duration={duration}
        onSeek={onSeek}
      />

      <div className="mt-1 flex items-center gap-1 text-white">
        <ControlButton label={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'} onClick={onToggle}>
          {state.isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
        </ControlButton>

        <ControlButton label={`Back ${SKIP_SECONDS}s (←)`} onClick={() => onSeekBy(-SKIP_SECONDS)}>
          <SkipBack className="h-4 w-4" />
        </ControlButton>

        <ControlButton label={`Forward ${SKIP_SECONDS}s (→)`} onClick={() => onSeekBy(SKIP_SECONDS)}>
          <SkipForward className="h-4 w-4" />
        </ControlButton>

        <span className="tabular ml-1.5 text-xs text-white/85">
          {formatDuration(state.positionSeconds)} / {formatDuration(duration)}
        </span>

        <div className="ml-auto flex items-center gap-1">
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
                'duration-[--duration-quick] group-hover/volume:w-20 group-hover/volume:opacity-100',
                'focus-visible:w-20 focus-visible:opacity-100',
              )}
            />
          </div>

          {extras}

          <ControlButton label="Picture in picture" onClick={onPictureInPicture}>
            <PictureInPicture2 className="h-4 w-4" />
          </ControlButton>

          <ControlButton label="Fullscreen (F)" onClick={onFullscreen}>
            <Maximize className="h-4 w-4" />
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
  const percent = (value: number) => (duration > 0 ? (value / duration) * 100 : 0);

  return (
    <div className="group/scrub relative flex h-4 w-full items-center">
      <div className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-white/25">
        <div className="h-full bg-white/35" style={{ width: `${percent(buffered)}%` }} />
      </div>
      <div
        className="pointer-events-none absolute left-0 h-1 rounded-full bg-[--accent]"
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
