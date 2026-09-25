import { useEffect, useRef } from 'react';

import { mediaUrls } from '@/lib/api';

export interface MediaSessionState {
  title: string;
  album?: string;
  artworkPath: string;
  isPlaying: boolean;
  position: number;
  duration: number;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (seconds: number) => void;
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
}

const ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'seekbackward',
  'seekforward',
  'previoustrack',
  'nexttrack',
  'seekto',
];

/** Lock screen, notification shade and headphone buttons. */
export function useMediaSession(active: boolean, state: MediaSessionState): void {
  const latest = useRef(state);
  latest.current = state;
  const { title, album, artworkPath, isPlaying, position, duration } = state;
  const hasPrevious = Boolean(state.onPrevious);
  const hasNext = Boolean(state.onNext);

  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({
      title,
      ...(album ? { album } : {}),
      artwork: [
        { src: mediaUrls.thumbnail(artworkPath, 512), sizes: '512x512', type: 'image/webp' },
      ],
    });

    // Unsupported actions throw on some browsers.
    const bind = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        /* unsupported */
      }
    };
    bind('play', () => latest.current.onPlay());
    bind('pause', () => latest.current.onPause());
    bind('seekbackward', () => latest.current.onSeek(Math.max(0, latest.current.position - 10)));
    bind('seekforward', () => latest.current.onSeek(latest.current.position + 10));
    bind('previoustrack', hasPrevious ? () => latest.current.onPrevious?.() : null);
    bind('nexttrack', hasNext ? () => latest.current.onNext?.() : null);
    bind('seekto', details => {
      if (typeof details.seekTime === 'number') latest.current.onSeek(details.seekTime);
    });

    return () => {
      for (const action of ACTIONS) bind(action, null);
      session.metadata = null;
    };
  }, [active, title, album, artworkPath, hasPrevious, hasNext]);

  useEffect(() => {
    if (!active || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    if (Number.isFinite(duration) && duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          position: Math.min(position, duration),
          playbackRate: 1,
        });
      } catch {
        /* position briefly past duration during a seek */
      }
    }
  }, [active, isPlaying, position, duration]);
}
