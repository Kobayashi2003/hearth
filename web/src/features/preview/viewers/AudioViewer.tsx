import { useEffect, useState } from 'react';
import { Music } from 'lucide-react';
import type { FileEntry } from '@hearth/shared';

import { mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { baseName, formatDuration, parentOf } from '@/lib/format';
import { Scrubber } from '@/ui/Scrubber';
import { usePreview } from '../PreviewProvider';
import { ViewerFrame } from '../ViewerFrame';
import { playingSpan, type Album } from '../audio/album';
import { usePlayer } from '../audio/PlayerProvider';
import { ModeButtons, SkipButtons, VolumeControl } from '../audio/transport';
import type { ViewerProps } from '../overlay';

/**
 * Opening an audio file hands it to the player; this view is the player's
 * full-size face. An album ripped to one file shows its tracks, and the seek
 * bar spans the track playing, as a CD player's does.
 */
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

  const { playlist, album, listed } = listing(player, entry);

  return (
    <ViewerFrame entry={entry} subtitle={baseName(parentOf(entry.path)) || undefined}>
      <div
        className={cn(
          'grid h-full min-h-0 grid-cols-[minmax(0,1fr)]',
          listed && 'grid-rows-[1fr_auto] md:grid-cols-[1fr_20rem] md:grid-rows-1',
        )}
      >
        <div className="flex min-h-0 flex-col items-center justify-center gap-6 px-6 pb-[calc(1.5rem+var(--safe-bottom))]">
          <Artwork path={entry.path} />
          <div className="w-full max-w-md">
            {album ? <NowPlaying album={album} /> : null}
            <TrackScrubber album={album} />
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

        {listed ? (
          <div className="scroll-thin max-h-[40vh] overflow-auto border-t border-white/10 py-2 md:max-h-none md:border-l md:border-t-0">
            {album ? <AlbumTracks album={album} onSeek={player.seek} /> : null}
            {playlist.length > 1 ? (
              <FolderTracks
                playlist={playlist}
                playing={entry.path}
                titled={album !== null}
                onPlay={item => player.play(item, playlist)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </ViewerFrame>
  );
}

/** What the list beside the player shows: the album's tracks, the folder's files, or nothing. */
function listing(player: ReturnType<typeof usePlayer>, entry: FileEntry) {
  const playlist = player.playlist.length > 0 ? player.playlist : [entry];
  const album = player.track?.path === entry.path ? player.album : null;
  return { playlist, album, listed: album !== null || playlist.length > 1 };
}

/** The track's own title, and who and what album it is from. */
function NowPlaying({ album }: { album: Album }) {
  const track = album.tracks[album.current]!;
  const performer = track.performer ?? album.sheet.performer;
  const from = [performer, album.sheet.title].filter(Boolean).join(' — ');
  return (
    <div className="mb-4 min-w-0 text-center">
      <p
        className="truncate text-[17px] font-semibold text-stage-ink"
        title={track.title ?? undefined}
      >
        {track.title ?? `Track ${track.number}`}
      </p>
      {from ? <p className="mt-0.5 truncate text-[13px] text-stage-ink/60">{from}</p> : null}
    </div>
  );
}

/** Over the whole file, or over the track playing when the file is an album. */
function TrackScrubber({ album }: { album: Album | null }) {
  const player = usePlayer();
  const { start, length } = playingSpan(album, player.duration);
  const at = Math.max(0, player.position - start);
  return (
    <>
      <Scrubber
        value={at}
        max={length}
        onChange={value => player.seek(start + value)}
        label="Seek"
        className="text-stage-ink"
      />
      <div className="tabular mt-1 flex justify-between text-[12px] text-stage-ink/60">
        <span>{formatDuration(at)}</span>
        <span>{formatDuration(length)}</span>
      </div>
    </>
  );
}

function AlbumTracks({ album, onSeek }: { album: Album; onSeek: (seconds: number) => void }) {
  const { sheet } = album;
  return (
    <section aria-label="Tracks">
      <header className="px-4 pb-2 pt-1">
        <p className="truncate text-[13px] font-medium text-stage-ink">{sheet.title ?? 'Tracks'}</p>
        <p className="truncate text-[12px] text-stage-ink/50">
          {[sheet.performer, sheet.date].filter(Boolean).join(', ')}
        </p>
      </header>
      <ol>
        {album.tracks.map((track, index) => (
          <li key={track.number}>
            <TrackRow
              number={track.number}
              playing={index === album.current}
              onClick={() => onSeek(track.start)}
              trailing={formatDuration(track.end - track.start)}
            >
              <span className="block truncate">{track.title ?? `Track ${track.number}`}</span>
              {track.performer ? (
                <span className="block truncate text-[12px] opacity-60">{track.performer}</span>
              ) : null}
            </TrackRow>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FolderTracks({
  playlist,
  playing,
  titled,
  onPlay,
}: {
  playlist: FileEntry[];
  playing: string;
  /** Under an album's tracks, the files get a heading of their own. */
  titled: boolean;
  onPlay: (item: FileEntry) => void;
}) {
  return (
    <section
      aria-label="In this folder"
      className={cn(titled && 'mt-3 border-t border-white/10 pt-2')}
    >
      {titled ? (
        <p className="px-4 pb-1 pt-1 text-[12px] font-medium text-stage-ink/50">In this folder</p>
      ) : null}
      <ol>
        {playlist.map((item, position) => (
          <li key={item.path}>
            <TrackRow
              number={position + 1}
              playing={item.path === playing}
              onClick={() => onPlay(item)}
            >
              <span className="block truncate">{item.name}</span>
            </TrackRow>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TrackRow({
  number,
  playing,
  onClick,
  trailing,
  children,
}: {
  number: number;
  playing: boolean;
  onClick: () => void;
  trailing?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={playing ? 'true' : undefined}
      className={cn(
        'flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] hover:bg-white/5',
        playing ? 'text-ember' : 'text-stage-ink/80',
      )}
    >
      <span className="tabular w-6 shrink-0 text-right text-[12px] opacity-60">{number}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {trailing ? (
        <span className="tabular shrink-0 text-[12px] opacity-50">{trailing}</span>
      ) : null}
    </button>
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
