import {
  Gauge,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { MediaTrack } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { Button } from '@/ui/Button';
import { Menu, MenuChoice, MenuLabel } from '@/ui/Menu';
import { Scrubber } from '@/ui/Scrubber';
import { TrackMenu } from './TrackMenu';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

interface TrackChoice {
  tracks: readonly MediaTrack[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}

/** The bar along the bottom of a playing film; it only reports, the viewer decides. */
export function VideoControls({
  hidden,
  position,
  duration,
  buffered,
  onSeek,
  playing,
  onToggle,
  onStep,
  canStep,
  muted,
  volume,
  onVolume,
  onToggleMute,
  audio,
  subtitles,
  rate,
  onRate,
  onPictureInPicture,
  note,
}: {
  hidden: boolean;
  position: number;
  duration: number;
  buffered: number;
  onSeek: (seconds: number) => void;
  playing: boolean;
  onToggle: () => void;
  onStep: (delta: number) => void;
  /** More than one video in the folder. */
  canStep: boolean;
  muted: boolean;
  volume: number;
  onVolume: (volume: number) => void;
  onToggleMute: () => void;
  audio: TrackChoice;
  subtitles: TrackChoice;
  rate: number;
  onRate: (rate: number) => void;
  onPictureInPicture: (() => void) | null;
  /** A line under the controls: conversion or subtitle loading. */
  note: string | null;
}) {
  return (
    <div
      className={cn(
        'absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 transition-opacity duration-300',
        hidden && 'pointer-events-none opacity-0',
      )}
    >
      <Scrubber
        value={position}
        max={duration}
        buffered={buffered}
        onChange={onSeek}
        label="Seek"
        className="text-white"
      />
      <div className="mt-1 flex items-center gap-1">
        {canStep ? (
          <Button
            variant="stage"
            size="icon"
            onClick={() => onStep(-1)}
            aria-label="Previous video"
            title="Previous (P)"
          >
            <SkipBack />
          </Button>
        ) : null}
        <Button
          variant="stage"
          size="icon"
          onClick={onToggle}
          aria-label={playing ? 'Pause' : 'Play'}
          title="Play/pause (Space)"
        >
          {playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
        </Button>
        {canStep ? (
          <Button
            variant="stage"
            size="icon"
            onClick={() => onStep(1)}
            aria-label="Next video"
            title="Next (N)"
          >
            <SkipForward />
          </Button>
        ) : null}
        <Button
          variant="stage"
          size="icon"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
        >
          {muted || volume === 0 ? <VolumeX /> : <Volume2 />}
        </Button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          onChange={event => onVolume(Number(event.target.value))}
          aria-label="Volume"
          className="hidden w-20 accent-current sm:block"
        />
        <span className="tabular ml-2 text-[12px] text-white/75">
          {formatDuration(position)} / {formatDuration(duration)}
        </span>
        <span className="flex-1" />
        <TrackMenu kind="audio" {...audio} />
        <TrackMenu kind="subtitle" {...subtitles} />
        <Menu
          side="top"
          trigger={
            <Button variant="stage" size="icon" aria-label={`Speed ${rate}×`} title="Speed">
              <Gauge />
            </Button>
          }
        >
          <MenuLabel>Speed</MenuLabel>
          {RATES.map(option => (
            <MenuChoice key={option} checked={rate === option} onSelect={() => onRate(option)}>
              {option === 1 ? 'Normal' : `${option}×`}
            </MenuChoice>
          ))}
        </Menu>
        {onPictureInPicture ? (
          <Button
            variant="stage"
            size="icon"
            aria-label="Picture in picture"
            title="Picture in picture"
            onClick={onPictureInPicture}
          >
            <PictureInPicture2 />
          </Button>
        ) : null}
      </div>
      {note ? <p className="mt-1 text-[11.5px] text-white/50">{note}</p> : null}
    </div>
  );
}
