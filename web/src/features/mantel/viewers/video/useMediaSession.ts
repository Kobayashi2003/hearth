import { useEffect } from 'react';

import { mediaUrls } from '@/lib/api';

/**
 * System playback controls — the lock screen, the notification shade, the
 * headphone button, the keyboard's media keys.
 *
 * On a phone this is most of what "playing something" means: the screen is off
 * and the only surface is the lock screen. Without it, pausing means waking the
 * device, unlocking it, and finding the tab.
 */
export interface MediaSessionActions {
  title: string;
  /** The folder the file sits in — the closest thing a file tree has to an album. */
  album?: string;
  /** Shown as artwork on the lock screen; the file's own thumbnail. */
  path: string;
  isPlaying: boolean;
  positionSeconds: number;
  durationSeconds: number;
  /** Keeps the system scrubber in step when playing faster or slower. */
  rate?: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onSeekBy: (delta: number) => void;
  /** Absent when this file has no playlist to step through. */
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}

export function useMediaSession(active: boolean, actions: MediaSessionActions): void {
  const {
    title,
    album,
    path,
    isPlaying,
    positionSeconds,
    durationSeconds,
    rate = 1,
    onPlay,
    onPause,
    onSeek,
    onSeekBy,
    onPrevious,
    onNext,
  } = actions;

  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;

    session.metadata = new MediaMetadata({
      title,
      ...(album ? { album } : {}),
      artwork: [
        { src: mediaUrls.thumbnail(path, 512), sizes: '512x512', type: 'image/webp' },
      ],
    });

    const bind = (action: MediaSessionAction, handler: (() => void) | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // Not every browser implements every action; an unsupported one throws.
      }
    };

    bind('play', onPlay);
    bind('pause', onPause);
    bind('seekbackward', () => onSeekBy(-10));
    bind('seekforward', () => onSeekBy(10));
    bind('previoustrack', onPrevious ?? null);
    bind('nexttrack', onNext ?? null);

    try {
      session.setActionHandler('seekto', (details: MediaSessionActionDetails) => {
        if (typeof details.seekTime === 'number') onSeek(details.seekTime);
      });
    } catch {
      // Same again: `seekto` is the least widely supported of the set.
    }

    return () => {
      for (const action of [
        'play',
        'pause',
        'seekbackward',
        'seekforward',
        'previoustrack',
        'nexttrack',
        'seekto',
      ] as MediaSessionAction[]) {
        bind(action, null);
      }
      session.metadata = null;
    };
  }, [active, title, album, path, onPlay, onPause, onSeek, onSeekBy, onPrevious, onNext]);

  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [active, isPlaying]);

  // Drives the scrubber the system draws on the lock screen.
  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: durationSeconds,
        position: Math.min(positionSeconds, durationSeconds),
        playbackRate: rate,
      });
    } catch {
      // Throws if position exceeds duration during a seek; the next tick fixes it.
    }
  }, [active, positionSeconds, durationSeconds, rate]);
}
