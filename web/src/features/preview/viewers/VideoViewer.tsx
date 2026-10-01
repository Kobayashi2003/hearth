import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';

import { api, mediaUrls } from '@/lib/api';
import { useKeyBindings } from '@/lib/keys';
import { local } from '@/lib/storage';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { percentOf, useProgress } from '@/features/progress/progress';
import { usePlayer } from '../audio/PlayerProvider';
import { useMediaSession } from '../audio/useMediaSession';
import { useOverlay, type ViewerProps } from '../overlay';
import { useIdle, ViewerFrame } from '../ViewerFrame';
import { preferredAudio, rememberAudio } from './video/tracks';
import { useSubtitles } from './video/useSubtitles';
import { VideoControls } from './video/VideoControls';

const SAVE_EVERY_SECONDS = 5;
const RESUME_MIN_SECONDS = 30;
const RESUME_END_MARGIN = 20;

export default function VideoViewer({ entry }: ViewerProps) {
  const path = entry.path;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { step, index, total, toggleFullscreen } = useOverlay();
  const { progressFor, save } = useProgress();
  const { pause: pauseMusic } = usePlayer();
  const idle = useIdle(true);

  // Null until the viewer picks: the language chosen last time applies.
  const [audioChoice, setAudioChoice] = useState<number | null>(null);
  // A transcode restarts at an offset to seek; the element's clock counts from there.
  const [offset, setOffset] = useState(0);
  const [state, setState] = useState({
    playing: false,
    time: 0,
    duration: 0,
    buffered: 0,
    waiting: true,
  });
  const [volume, setVolume] = useState(() => Number(local.get('hearth.volume') ?? 1));
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const resumeAt = useRef<number | null>(null);
  const lastSaved = useRef(0);

  const { data: probe, isPending: probing } = useQuery({
    queryKey: ['probe', path],
    queryFn: ({ signal }) => api.probe(path, signal),
    staleTime: Infinity,
    retry: false,
  });

  useEffect(() => pauseMusic(), [pauseMusic]);

  if (resumeAt.current === null) {
    const saved = progressFor(path);
    resumeAt.current = saved?.kind === 'time' && typeof saved.at === 'number' ? saved.at : 0;
  }

  const audioTracks = probe?.audioTracks ?? [];
  const audioTrack = audioChoice ?? preferredAudio(audioTracks);

  // Set when the browser refused the original file despite the probe; the stream is then converted.
  const [forceTranscode, setForceTranscode] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const transcoding = forceTranscode || (probe ? !probe.browserPlayable || audioTrack > 0 : false);

  const subtitles = useSubtitles({
    path,
    probed: probe?.subtitleTracks ?? [],
    offset,
    transcoding,
  });

  const duration = probe?.durationSeconds ?? state.duration;
  const position = offset + state.time;

  const source = transcoding
    ? mediaUrls.transcode(path, { audioTrack, start: offset })
    : mediaUrls.raw(path);

  const seek = useCallback(
    (seconds: number) => {
      const target = Math.max(0, Math.min(duration || seconds, seconds));
      if (transcoding) setOffset(target);
      else if (videoRef.current) videoRef.current.currentTime = target;
    },
    [transcoding, duration],
  );

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => undefined);
    else video.pause();
  }, []);

  const applyVolume = useCallback((next: number) => {
    const clamped = Math.min(1, Math.max(0, next));
    setVolume(clamped);
    local.set('hearth.volume', String(clamped));
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = false;
    }
  }, []);

  useEffect(() => {
    if (!duration || Math.abs(position - lastSaved.current) < SAVE_EVERY_SECONDS) return;
    lastSaved.current = position;
    const nearEnd = position > duration - RESUME_END_MARGIN;
    save(path, {
      kind: 'time',
      at: nearEnd ? 0 : position,
      total: duration,
      percent: nearEnd ? 100 : percentOf(position, duration),
      savedAt: Date.now(),
    });
  }, [position, duration, path, save]);

  const toggleMute = () => {
    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
  };
  useKeyBindings(
    (
      [
        [[' ', 'k'], toggle],
        ['ArrowLeft', () => seek(position - 10)],
        ['ArrowRight', () => seek(position + 10)],
        ['ArrowUp', () => applyVolume(volume + 0.1)],
        ['ArrowDown', () => applyVolume(volume - 0.1)],
        ['m', toggleMute],
        ['f', toggleFullscreen],
        ['n', () => step(1)],
        ['p', () => step(-1)],
      ] as const
    ).map(([key, run]) => ({ key, ctrl: false, run })),
  );

  useMediaSession(true, {
    title: entry.name,
    artworkPath: path,
    isPlaying: state.playing,
    position,
    duration,
    onPlay: toggle,
    onPause: () => videoRef.current?.pause(),
    onSeek: seek,
    onPrevious: total > 1 ? () => step(-1) : undefined,
    onNext: total > 1 ? () => step(1) : undefined,
  });

  const lastTap = useRef(0);
  const pointerType = useRef('mouse');
  function onStagePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === 'mouse') return;
    const now = Date.now();
    const rect = event.currentTarget.getBoundingClientRect();
    const zone = (event.clientX - rect.left) / rect.width;
    if (now - lastTap.current < 300 && zone < 0.35) seek(position - 10);
    else if (now - lastTap.current < 300 && zone > 0.65) seek(position + 10);
    lastTap.current = now;
  }

  const controlsHidden = idle && state.playing;

  return (
    <ViewerFrame entry={entry} immersive className="bg-black">
      <div className="absolute inset-0" onPointerUp={onStagePointerUp}>
        {!probing ? (
          <video
            ref={videoRef}
            key={source}
            src={source}
            autoPlay
            playsInline
            className="size-full"
            onPointerDown={event => (pointerType.current = event.pointerType)}
            onClick={() => pointerType.current === 'mouse' && toggle()}
            onLoadedMetadata={event => {
              const video = event.currentTarget;
              video.volume = volume;
              video.playbackRate = rate;
              const at = resumeAt.current ?? 0;
              resumeAt.current = 0;
              if (at > RESUME_MIN_SECONDS && at < (duration || video.duration) - RESUME_END_MARGIN)
                seek(at);
            }}
            onPlay={() => setState(current => ({ ...current, playing: true }))}
            onPause={() => setState(current => ({ ...current, playing: false, waiting: false }))}
            onWaiting={() => setState(current => ({ ...current, waiting: true }))}
            onPlaying={() => setState(current => ({ ...current, waiting: false, playing: true }))}
            onCanPlay={() => setState(current => ({ ...current, waiting: false }))}
            onVolumeChange={event => setMuted(event.currentTarget.muted)}
            onDurationChange={event => {
              // Read now: React clears currentTarget before a state updater runs.
              const length = event.currentTarget.duration || 0;
              setState(current => ({ ...current, duration: length }));
            }}
            onTimeUpdate={event => {
              const video = event.currentTarget;
              const buffered = video.buffered.length
                ? video.buffered.end(video.buffered.length - 1)
                : 0;
              setState(current => ({ ...current, time: video.currentTime, buffered }));
            }}
            onEnded={() => total > 1 && index < total - 1 && step(1)}
            onError={() => {
              setState(current => ({ ...current, waiting: false }));
              if (!transcoding) {
                setOffset(position);
                setForceTranscode(true);
              } else {
                setFailure(
                  'The video could not be converted for this browser. Check that ffmpeg is installed on the server, or download the file.',
                );
              }
            }}
          >
            {subtitles.trackProps ? (
              <track key={subtitles.selected} kind="subtitles" default {...subtitles.trackProps} />
            ) : null}
          </video>
        ) : null}

        {failure ? (
          <Notice
            className="absolute inset-0 bg-stage"
            icon={<TriangleAlert />}
            title="This video cannot be played here"
            body={failure}
          />
        ) : state.waiting ? (
          <Centered className="pointer-events-none absolute inset-0 flex-col gap-3">
            <Spinner className="size-8" />
            {transcoding ? (
              <p className="animate-appear px-6 text-center text-[13px] text-stage-ink/70">
                Converting for this browser. The first seconds take a moment.
              </p>
            ) : null}
          </Centered>
        ) : null}
      </div>

      <VideoControls
        hidden={controlsHidden}
        position={position}
        duration={duration}
        buffered={offset + state.buffered}
        onSeek={seek}
        playing={state.playing}
        onToggle={toggle}
        onStep={step}
        canStep={total > 1}
        muted={muted}
        volume={volume}
        onVolume={applyVolume}
        onToggleMute={toggleMute}
        audio={{
          tracks: audioTracks,
          selected: audioTrack,
          onSelect: track => {
            if (track === null || track === audioTrack) return;
            rememberAudio(audioTracks.find(candidate => candidate.index === track));
            setOffset(position);
            setAudioChoice(track);
          },
        }}
        subtitles={{
          tracks: subtitles.tracks,
          selected: subtitles.selected,
          onSelect: subtitles.choose,
        }}
        rate={rate}
        onRate={option => {
          setRate(option);
          if (videoRef.current) videoRef.current.playbackRate = option;
        }}
        onPictureInPicture={
          document.pictureInPictureEnabled
            ? () =>
                document.pictureInPictureElement
                  ? void document.exitPictureInPicture()
                  : void videoRef.current?.requestPictureInPicture().catch(() => undefined)
            : null
        }
        note={
          subtitles.status === 'loading'
            ? 'Loading subtitles. The first time reads the whole file, so a long film takes a while.'
            : subtitles.status === 'failed'
              ? 'These subtitles could not be read.'
              : transcoding
                ? 'Converted on the fly for this browser; seeking restarts the stream.'
                : null
        }
      />
    </ViewerFrame>
  );
}
