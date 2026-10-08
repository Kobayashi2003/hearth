import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { baseName, formatDuration, parentOf } from '@/lib/format';
import { Scrubber } from '@/ui/Scrubber';
import { usePreview } from '../PreviewProvider';
import { ViewerFrame } from '../ViewerFrame';
import { usePlayer } from '../audio/PlayerProvider';
import { ModeButtons, SkipButtons, VolumeControl } from '../audio/transport';
import type { ViewerProps } from '../overlay';

/** Opening an audio file hands it to the player; this view is the player's full-size face. */
export default function AudioViewer({ entry }: ViewerProps) {
  const player = usePlayer();
  const { current, show } = usePreview();

  useEffect(() => {
    player.play(entry, current?.gallery ?? [entry]);
    // Only a different file restarts playback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.path]);

  // The player may move on by itself (next track); keep the preview on what is playing.
  useEffect(() => {
    if (player.track && player.track.path !== entry.path) show(player.track);
  }, [player.track, entry.path, show]);

  const playlist = player.playlist.length > 0 ? player.playlist : [entry];
  const index = playlist.findIndex(item => item.path === entry.path);

  return (
    <ViewerFrame entry={entry} subtitle={baseName(parentOf(entry.path)) || undefined}>
      <div
        className={cn(
          'grid h-full min-h-0 grid-cols-[minmax(0,1fr)]',
          playlist.length > 1 && 'grid-rows-[1fr_auto] md:grid-cols-[1fr_20rem] md:grid-rows-1',
        )}
      >
        <div className="flex min-h-0 flex-col items-center justify-center gap-6 px-6 pb-[calc(1.5rem+var(--safe-bottom))]">
          <Artwork path={entry.path} />
          <div className="w-full max-w-md">
            <Scrubber
              value={player.position}
              max={player.duration}
              onChange={player.seek}
              label="Seek"
              className="text-stage-ink"
            />
            <div className="tabular mt-1 flex justify-between text-[12px] text-stage-ink/60">
              <span>{formatDuration(player.position)}</span>
              <span>{formatDuration(player.duration)}</span>
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              <ModeButtons />
              <SkipButtons />
              {/* A phone sets the volume with its own buttons; iOS ignores a page's anyway. */}
              <div className="max-sm:hidden">
                <VolumeControl />
              </div>
            </div>
          </div>
        </div>

        {playlist.length > 1 ? (
          <ol className="scroll-thin max-h-[40vh] overflow-auto border-t border-white/10 py-2 md:max-h-none md:border-l md:border-t-0">
            {playlist.map((item, position) => (
              <li key={item.path}>
                <button
                  type="button"
                  onClick={() => player.play(item, playlist)}
                  className={cn(
                    'flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] hover:bg-white/5',
                    position === index ? 'text-ember' : 'text-stage-ink/80',
                  )}
                >
                  <span className="tabular w-6 shrink-0 text-right text-[12px] opacity-60">
                    {position + 1}
                  </span>
                  <span className="truncate">{item.name}</span>
                </button>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </ViewerFrame>
  );
}

function Artwork({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [path]);
  return (
    <div className="grid aspect-square w-[min(18rem,60vw)] place-items-center overflow-hidden rounded-2xl bg-white/5 shadow-2xl">
      {failed ? (
        <Music className="size-16 text-stage-ink/30" />
      ) : (
        <img
          src={mediaUrls.thumbnail(path, 640)}
          alt=""
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </div>
  );
}
