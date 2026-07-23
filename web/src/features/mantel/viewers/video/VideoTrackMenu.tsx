import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Check, Gauge, Languages } from 'lucide-react';
import type { MediaTrack } from '@hearth/shared';

import { Button } from '@/components/ui/Button';
import { Tooltip } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

/** A track's most useful label: its title, else its language, else its position. */
function trackLabel(track: MediaTrack, index: number): string {
  if (track.title) return track.title;
  if (track.language) return track.language.toUpperCase();
  return `Track ${index + 1}`;
}

const menuContentClass = cn(
  'z-50 min-w-44 rounded-lg border border-subtle bg-overlay p-1 shadow-lg',
  'text-sm text-primary',
);

const menuItemClass = cn(
  'flex cursor-pointer items-center justify-between gap-3 rounded px-2 py-1.5',
  'outline-none data-[highlighted]:bg-sunken',
);

/**
 * Audio and subtitle selection. Previously buried behind an unlabelled icon;
 * here it is one labelled menu holding both track lists, which is how someone
 * actually thinks about "change the language".
 */
export function VideoTrackMenu({
  audioTracks,
  subtitleTracks,
  activeAudioTrack,
  activeSubtitleTrack,
  onSelectAudio,
  onSelectSubtitle,
}: {
  audioTracks: MediaTrack[];
  subtitleTracks: MediaTrack[];
  activeAudioTrack: number;
  activeSubtitleTrack: number | null;
  onSelectAudio: (index: number) => void;
  onSelectSubtitle: (index: number | null) => void;
}) {
  const hasChoice = audioTracks.length > 1 || subtitleTracks.length > 0;
  if (!hasChoice) return null;

  return (
    <DropdownMenu.Root>
      <Tooltip label="Audio and subtitles">
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Audio and subtitles"
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <Languages className="h-4 w-4" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={8} align="end" className={menuContentClass}>
          {audioTracks.length > 1 ? (
            <>
              <DropdownMenu.Label className="eyebrow px-2 py-1.5">Audio</DropdownMenu.Label>
              {audioTracks.map((track, index) => (
                <DropdownMenu.Item
                  key={track.index}
                  className={menuItemClass}
                  onSelect={() => onSelectAudio(track.index)}
                >
                  <span className="truncate">{trackLabel(track, index)}</span>
                  {activeAudioTrack === track.index ? <Check className="h-4 w-4 text-accent" /> : null}
                </DropdownMenu.Item>
              ))}
            </>
          ) : null}

          {subtitleTracks.length > 0 ? (
            <>
              {audioTracks.length > 1 ? (
                <DropdownMenu.Separator className="my-1 h-px bg-subtle" />
              ) : null}
              <DropdownMenu.Label className="eyebrow px-2 py-1.5">Subtitles</DropdownMenu.Label>
              <DropdownMenu.Item className={menuItemClass} onSelect={() => onSelectSubtitle(null)}>
                <span>Off</span>
                {activeSubtitleTrack === null ? <Check className="h-4 w-4 text-accent" /> : null}
              </DropdownMenu.Item>
              {subtitleTracks.map((track, index) => (
                <DropdownMenu.Item
                  key={track.index}
                  className={menuItemClass}
                  onSelect={() => onSelectSubtitle(track.index)}
                >
                  <span className="truncate">{trackLabel(track, index)}</span>
                  {activeSubtitleTrack === track.index ? (
                    <Check className="h-4 w-4 text-accent" />
                  ) : null}
                </DropdownMenu.Item>
              ))}
            </>
          ) : null}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function VideoRateMenu({
  rate,
  onSelect,
}: {
  rate: number;
  onSelect: (rate: number) => void;
}) {
  return (
    <DropdownMenu.Root>
      <Tooltip label="Playback speed">
        <DropdownMenu.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Playback speed"
            className="text-white hover:bg-white/15 hover:text-white"
          >
            <Gauge className="h-4 w-4" />
          </Button>
        </DropdownMenu.Trigger>
      </Tooltip>

      <DropdownMenu.Portal>
        <DropdownMenu.Content sideOffset={8} align="end" className={menuContentClass}>
          <DropdownMenu.Label className="eyebrow px-2 py-1.5">Speed</DropdownMenu.Label>
          {PLAYBACK_RATES.map(candidate => (
            <DropdownMenu.Item
              key={candidate}
              className={menuItemClass}
              onSelect={() => onSelect(candidate)}
            >
              <span className="tabular">{candidate}×</span>
              {rate === candidate ? <Check className="h-4 w-4 text-accent" /> : null}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
