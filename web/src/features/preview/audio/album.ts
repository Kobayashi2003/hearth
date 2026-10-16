import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { CueSheet, CueTrack, FileEntry } from '@hearth/shared';

import { api } from '@/lib/api';
import { baseName, parentOf } from '@/lib/format';
import type { RepeatMode } from './PlayerProvider';

/** Past this far into a track, Previous goes back to its start rather than to the track before. */
const RESTART_AFTER_SECONDS = 3;
/** How near the next track's start counts as having just played into it rather than jumped there. */
const RAN_ON_SECONDS = 1.5;

export interface AlbumTrack extends CueTrack {
  /** Where the next track starts, or the end of the file. */
  end: number;
}

/** A file that is a whole album, with the track playing now. */
export interface Album {
  sheet: CueSheet;
  tracks: AlbumTrack[];
  /** Index into `tracks`. */
  current: number;
}

/** The stretch a seek bar spans: the album track playing, else the whole file. */
export function playingSpan(album: Album | null, duration: number) {
  const track = album?.tracks[album.current];
  return track
    ? { start: track.start, length: track.end - track.start, title: track.title }
    : { start: 0, length: duration, title: null };
}

/** What is playing, as a lock screen names it. */
export function nowPlaying(file: FileEntry | null, album: Album | null) {
  const track = album?.tracks[album.current];
  return {
    title: track?.title ?? file?.name ?? '',
    artist: track?.performer ?? album?.sheet.performer ?? undefined,
    album: album?.sheet.title ?? (file ? baseName(parentOf(file.path)) : ''),
  };
}

/** Something to go back or on to: another file in the list, or another track of the album. */
export function canSkipFrom(
  playlist: readonly FileEntry[],
  file: FileEntry | null,
  album: Album | null,
): boolean {
  const listed = file !== null && playlist.some(item => item.path === file.path);
  return (listed && playlist.length > 1) || (album?.tracks.length ?? 0) > 1;
}

/** The track a moment falls in: the last that starts at or before it. */
export function trackAt(tracks: readonly CueTrack[], seconds: number): number {
  let index = 0;
  while (index + 1 < tracks.length && tracks[index + 1]!.start <= seconds) index += 1;
  return index;
}

/**
 * When the file playing is an album ripped to one file, its tracks behave as
 * tracks: Previous and Next move between them (and on to the neighbouring
 * files at either end), shuffle picks one of them, repeat-one repeats one of
 * them.
 */
export function useAlbumPlayback({
  file,
  position,
  duration,
  repeat,
  shuffle,
  seek,
}: {
  file: FileEntry | null;
  position: number;
  duration: number;
  repeat: RepeatMode;
  shuffle: boolean;
  seek: (seconds: number) => void;
}) {
  const sheet = useQuery({
    queryKey: ['cue', file?.path],
    queryFn: ({ signal }) => api.cue(file!.path, signal),
    enabled: file !== null,
    staleTime: 5 * 60_000,
  }).data;
  const album = sheet ? albumOf(sheet, position, duration) : null;
  useRepeatTrack(album, repeat, position, seek);

  /** True when it moved within the album; false leaves it to the playlist. */
  const skipWithin = (delta: number): boolean => {
    const target = album && skipTarget(album, position, delta, shuffle ? Math.random() : null);
    if (target === null || target === undefined) return false;
    seek(target);
    return true;
  };

  return { album, skipWithin };
}

/**
 * Where Previous or Next goes inside an album, or null past either end, where
 * the neighbouring file takes over. Previous restarts a track a few seconds
 * in, as a CD player does; `random` (0–1) is a shuffle's pick.
 */
export function skipTarget(
  album: Album,
  position: number,
  delta: number,
  random: number | null,
): number | null {
  const { tracks, current } = album;
  if (random !== null) return tracks[Math.floor(random * tracks.length)]!.start;
  if (delta < 0 && position - tracks[current]!.start > RESTART_AFTER_SECONDS)
    return tracks[current]!.start;
  return tracks[current + Math.sign(delta)]?.start ?? null;
}

export function albumOf(sheet: CueSheet, position: number, duration: number): Album {
  const tracks = sheet.tracks.map((track, index) => ({
    ...track,
    end: sheet.tracks[index + 1]?.start ?? Math.max(duration, track.start),
  }));
  return { sheet, tracks, current: trackAt(tracks, position) };
}

/**
 * Repeat-one on an album: when playback runs on into the next track, back to
 * the start of the one that ended. A jump (a seek, Next) is left alone.
 */
function useRepeatTrack(
  album: Album | null,
  repeat: RepeatMode,
  position: number,
  seek: (seconds: number) => void,
) {
  const previous = useRef<number | null>(null);
  const current = album?.current ?? null;
  useEffect(() => {
    const last = previous.current;
    previous.current = current;
    if (repeat !== 'one' || !album || last === null || current !== last + 1) return;
    if (position - album.tracks[current]!.start < RAN_ON_SECONDS) seek(album.tracks[last]!.start);
    // Only a change of track decides; position is read as it was then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);
}
