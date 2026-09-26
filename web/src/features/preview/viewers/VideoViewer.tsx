import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AudioLines,
  Captions,
  Gauge,
  Pause,
  PictureInPicture2,
  Play,
  SkipBack,
  SkipForward,
  TriangleAlert,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { isTextSubtitle, type MediaTrack } from '@hearth/shared';

import { api, mediaUrls } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatDuration } from '@/lib/format';
import { local } from '@/lib/storage';
import { Button } from '@/ui/Button';
import { Centered, Notice, Spinner } from '@/ui/Feedback';
import { Menu, MenuChoice, MenuLabel } from '@/ui/Menu';
import { Scrubber } from '@/ui/Scrubber';
import { percentOf, useProgress } from '@/features/progress/progress';
import { usePlayer } from '../audio/PlayerProvider';
import { useMediaSession } from '../audio/useMediaSession';
import { isTypingTarget, useOverlay } from '../PreviewOverlay';
import { useIdle, ViewerFrame } from '../ViewerFrame';
import type { ViewerProps } from '../viewers';
import {
  preferredAudio,
  preferredSubtitle,
  rememberAudio,
  rememberSubtitle,
  trackLabels,
} from './tracks';

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
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

  // Null / undefined until the viewer picks: the language chosen last time applies.
  const [audioChoice, setAudioChoice] = useState<number | null>(null);
  const [subtitleChoice, setSubtitleChoice] = useState<number | null | undefined>(undefined);
  // A transcode restarts at an offset to seek; the element's clock counts from there.
  const [offset, setOffset] = useState(0);
  const trackRef = useRef<HTMLTrackElement | null>(null);
  const cueTimes = useRef(new WeakMap<TextTrackCue, [number, number]>());
  // Which subtitle track last finished loading; any other selected one is still on its way.
  const [subtitleLoaded, setSubtitleLoaded] = useState<{ index: number; failed: boolean } | null>(
    null,
  );
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
  // Bitmap subtitles (PGS, VobSub) have no WebVTT form; offering them would only fail.
  const subtitleTracks = (probe?.subtitleTracks ?? []).filter(track => isTextSubtitle(track.codec));
  const audioTrack = audioChoice ?? preferredAudio(audioTracks);
  const subtitle =
    subtitleChoice !== undefined ? subtitleChoice : preferredSubtitle(subtitleTracks);

  const subtitleStatus =
    subtitle === null
      ? 'ready'
      : subtitleLoaded?.index !== subtitle
        ? 'loading'
        : subtitleLoaded.failed
          ? 'failed'
          : 'ready';

  // Set when the browser refused the original file despite the probe; the stream is then converted.
  const [forceTranscode, setForceTranscode] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const transcoding = forceTranscode || (probe ? !probe.browserPlayable || audioTrack > 0 : false);

  // Subtitle cues are timed from the start of the film, but a converted stream
  // restarts its clock at the point it was started from; shift them to match.
  const alignCues = useCallback(() => {
    const cues = trackRef.current?.track.cues;
    if (!cues) return;
    const shift = transcoding ? offset : 0;
    for (const cue of Array.from(cues)) {
      let original = cueTimes.current.get(cue);
      if (!original) {
        original = [cue.startTime, cue.endTime];
        cueTimes.current.set(cue, original);
      }
      cue.startTime = original[0] - shift;
      cue.endTime = original[1] - shift;
    }
  }, [transcoding, offset]);
  useEffect(alignCues, [alignCues]);

  // React does not wire load/error on <track>, so listen natively. A track that
  // finished before the listener was attached is caught by its readyState.
  useEffect(() => {
    const element = trackRef.current;
    if (!element || subtitle === null) return;
    const loaded = () => {
      setSubtitleLoaded({ index: subtitle, failed: false });
      alignCues();
    };
    const failed = () => setSubtitleLoaded({ index: subtitle, failed: true });
    if (element.readyState === HTMLTrackElement.LOADED) loaded();
    else if (element.readyState === HTMLTrackElement.ERROR) failed();
    element.addEventListener('load', loaded);
    element.addEventListener('error', failed);
    return () => {
      element.removeEventListener('load', loaded);
      element.removeEventListener('error', failed);
    };
  }, [subtitle, alignCues]);

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

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || isTypingTarget(event.target) || event.ctrlKey || event.metaKey)
        return;
      const actions: Record<string, () => void> = {
        ' ': toggle,
        k: toggle,
        ArrowLeft: () => seek(position - 10),
        ArrowRight: () => seek(position + 10),
        ArrowUp: () => applyVolume(volume + 0.1),
        ArrowDown: () => applyVolume(volume - 0.1),
        m: () => videoRef.current && (videoRef.current.muted = !videoRef.current.muted),
        f: toggleFullscreen,
        n: () => step(1),
        p: () => step(-1),
      };
      const action = actions[event.key];
      if (action) {
        event.preventDefault();
        action();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggle, seek, position, applyVolume, volume, toggleFullscreen, step]);

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
            {subtitle !== null ? (
              <track
                key={subtitle}
                ref={trackRef}
                kind="subtitles"
                src={mediaUrls.subtitle(path, subtitle)}
                default
              />
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

      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pb-3 pt-10 transition-opacity duration-300',
          controlsHidden && 'pointer-events-none opacity-0',
        )}
      >
        <Scrubber
          value={position}
          max={duration}
          buffered={offset + state.buffered}
          onChange={seek}
          label="Seek"
          className="text-white"
        />
        <div className="mt-1 flex items-center gap-1">
          {total > 1 ? (
            <Button
              variant="stage"
              size="icon"
              onClick={() => step(-1)}
              aria-label="Previous video"
              title="Previous (P)"
            >
              <SkipBack />
            </Button>
          ) : null}
          <Button
            variant="stage"
            size="icon"
            onClick={toggle}
            aria-label={state.playing ? 'Pause' : 'Play'}
            title="Play/pause (Space)"
          >
            {state.playing ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
          </Button>
          {total > 1 ? (
            <Button
              variant="stage"
              size="icon"
              onClick={() => step(1)}
              aria-label="Next video"
              title="Next (N)"
            >
              <SkipForward />
            </Button>
          ) : null}
          <Button
            variant="stage"
            size="icon"
            onClick={() => videoRef.current && (videoRef.current.muted = !videoRef.current.muted)}
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
            onChange={event => applyVolume(Number(event.target.value))}
            aria-label="Volume"
            className="hidden w-20 accent-current sm:block"
          />
          <span className="tabular ml-2 text-[12px] text-white/75">
            {formatDuration(position)} / {formatDuration(duration)}
          </span>
          <span className="flex-1" />
          <TrackMenu
            kind="audio"
            tracks={audioTracks}
            selected={audioTrack}
            onSelect={track => {
              if (track === null || track === audioTrack) return;
              rememberAudio(audioTracks.find(candidate => candidate.index === track));
              setOffset(position);
              setAudioChoice(track);
            }}
          />
          <TrackMenu
            kind="subtitle"
            tracks={subtitleTracks}
            selected={subtitle}
            onSelect={track => {
              rememberSubtitle(subtitleTracks.find(candidate => candidate.index === track));
              setSubtitleChoice(track);
            }}
          />
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
              <MenuChoice
                key={option}
                checked={rate === option}
                onSelect={() => {
                  setRate(option);
                  if (videoRef.current) videoRef.current.playbackRate = option;
                }}
              >
                {option === 1 ? 'Normal' : `${option}×`}
              </MenuChoice>
            ))}
          </Menu>
          {document.pictureInPictureEnabled ? (
            <Button
              variant="stage"
              size="icon"
              aria-label="Picture in picture"
              title="Picture in picture"
              onClick={() =>
                document.pictureInPictureElement
                  ? void document.exitPictureInPicture()
                  : void videoRef.current?.requestPictureInPicture().catch(() => undefined)
              }
            >
              <PictureInPicture2 />
            </Button>
          ) : null}
        </div>
        {transcoding || subtitleStatus !== 'ready' ? (
          <p className="mt-1 text-[11.5px] text-white/50">
            {subtitleStatus === 'loading'
              ? 'Loading subtitles. The first time reads the whole file, so a long film takes a while.'
              : subtitleStatus === 'failed'
                ? 'These subtitles could not be read.'
                : 'Converted on the fly for this browser; seeking restarts the stream.'}
          </p>
        ) : null}
      </div>
    </ViewerFrame>
  );
}

/** One menu per kind: a film can carry a dozen dubs and forty subtitle tracks. */
function TrackMenu({
  kind,
  tracks,
  selected,
  onSelect,
}: {
  kind: 'audio' | 'subtitle';
  tracks: MediaTrack[];
  selected: number | null;
  onSelect: (index: number | null) => void;
}) {
  const isAudio = kind === 'audio';
  if (isAudio ? tracks.length < 2 : tracks.length === 0) return null;
  const labels = trackLabels(tracks, isAudio ? 'Track' : 'Subtitle');
  const title = isAudio ? 'Audio' : 'Subtitles';
  return (
    <Menu
      side="top"
      trigger={
        <Button
          variant="stage"
          size="icon"
          aria-label={title}
          title={title}
          className={cn(!isAudio && selected !== null && 'text-white')}
        >
          {isAudio ? <AudioLines /> : <Captions />}
        </Button>
      }
    >
      <MenuLabel>{title}</MenuLabel>
      {isAudio ? null : (
        <MenuChoice checked={selected === null} closes onSelect={() => onSelect(null)}>
          Off
        </MenuChoice>
      )}
      {tracks.map(track => (
        <MenuChoice
          key={track.index}
          checked={selected === track.index}
          closes
          onSelect={() => onSelect(track.index)}
        >
          {labels.get(track.index)}
        </MenuChoice>
      ))}
    </Menu>
  );
}
