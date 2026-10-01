import {
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

import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { usePlayer } from './PlayerProvider';

function PlayButton({ className }: { className?: string }) {
  const player = usePlayer();
  return (
    <button
      type="button"
      onClick={player.toggle}
      aria-label={player.isPlaying ? 'Pause' : 'Play'}
      className={cn(
        'grid size-12 place-items-center rounded-full bg-ember text-white transition-transform active:scale-95 [&_svg]:size-5',
        className,
      )}
    >
      {player.isPlaying ? (
        <Pause fill="currentColor" />
      ) : (
        <Play fill="currentColor" className="translate-x-px" />
      )}
    </button>
  );
}

export function SkipButtons({ variant = 'stage' }: { variant?: 'stage' | 'quiet' }) {
  const player = usePlayer();
  const disabled = player.playlist.length < 2;
  return (
    <>
      <Button
        variant={variant}
        size="icon"
        onClick={() => player.skip(-1)}
        disabled={disabled}
        aria-label="Previous track"
      >
        <SkipBack />
      </Button>
      <PlayButton className={variant === 'quiet' ? 'size-9 [&_svg]:size-4' : undefined} />
      <Button
        variant={variant}
        size="icon"
        onClick={() => player.skip(1)}
        disabled={disabled}
        aria-label="Next track"
      >
        <SkipForward />
      </Button>
    </>
  );
}

export function ModeButtons() {
  const player = usePlayer();
  const RepeatIcon = player.repeat === 'one' ? Repeat1 : Repeat;
  return (
    <>
      <Button
        variant="stage"
        size="icon"
        onClick={player.toggleShuffle}
        aria-pressed={player.shuffle}
        aria-label="Shuffle"
        className={cn(player.shuffle && 'text-ember')}
      >
        <Shuffle />
      </Button>
      <Button
        variant="stage"
        size="icon"
        onClick={player.cycleRepeat}
        aria-label={`Repeat: ${player.repeat}`}
        className={cn(player.repeat !== 'off' && 'text-ember')}
      >
        <RepeatIcon />
      </Button>
    </>
  );
}

export function VolumeControl({ variant = 'stage' }: { variant?: 'stage' | 'quiet' }) {
  const player = usePlayer();
  const silent = player.muted || player.volume === 0;
  return (
    <div className="flex items-center gap-1">
      <Button
        variant={variant}
        size="icon"
        onClick={player.toggleMute}
        aria-label={silent ? 'Unmute' : 'Mute'}
      >
        {silent ? <VolumeX /> : <Volume2 />}
      </Button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={player.muted ? 0 : player.volume}
        onChange={event => player.setVolume(Number(event.target.value))}
        aria-label="Volume"
        className="w-20 accent-current"
      />
    </div>
  );
}
