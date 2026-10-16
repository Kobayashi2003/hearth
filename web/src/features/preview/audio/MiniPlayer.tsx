import { useState } from 'react';
import { Music, X } from 'lucide-react';

import { mediaUrls } from '@/lib/api';
import { viewerKindFor } from '@/lib/file-kind';
import { Button } from '@/ui/Button';
import { usePreview } from '../PreviewProvider';
import { playingSpan } from './album';
import { usePlayer } from './PlayerProvider';
import { SkipButtons } from './transport';

/** What keeps playing after its preview closed; clicking it brings the full player back. */
export function MiniPlayer() {
  const player = usePlayer();
  const preview = usePreview();
  const [failedArt, setFailedArt] = useState<string | null>(null);
  const track = player.track;

  const audioOpen = preview.current !== null && viewerKindFor(preview.current.entry) === 'audio';
  if (!track || audioOpen) return null;

  // On an album, the track playing, as the full player shows it.
  const span = playingSpan(player.album, player.duration);
  const progress = span.length > 0 ? ((player.position - span.start) / span.length) * 100 : 0;
  const title = span.title ?? track.name;

  return (
    <div className="animate-rise pointer-events-auto relative flex w-[min(24rem,calc(100vw-1.5rem))] items-center gap-2 overflow-hidden rounded-2xl border border-line bg-surface p-1.5 pr-2 shadow-float">
      <button
        type="button"
        onClick={() => preview.open(track, player.playlist)}
        className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        aria-label={`Open player: ${title}`}
      >
        <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-sunken">
          {failedArt === track.path ? (
            <Music className="size-4 text-ink-3" />
          ) : (
            <img
              src={mediaUrls.thumbnail(track.path, 96)}
              alt=""
              onError={() => setFailedArt(track.path)}
              className="size-full object-cover"
            />
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-medium">{title}</span>
          <span className="block text-[12px] text-ink-3">
            {player.isPlaying ? 'Playing' : 'Paused'}
          </span>
        </span>
      </button>
      <SkipButtons variant="quiet" />
      <Button size="icon" onClick={player.stop} aria-label="Stop and close player">
        <X />
      </Button>
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-0.5 bg-ember"
        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
      />
    </div>
  );
}
