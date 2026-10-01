import { AudioLines, Captions } from 'lucide-react';
import type { MediaTrack } from '@hearth/shared';

import { cn } from '@/lib/cn';
import { Button } from '@/ui/Button';
import { Menu, MenuChoice, MenuLabel } from '@/ui/Menu';
import { trackLabels } from './tracks';

/** One menu per kind: a film can carry a dozen dubs and forty subtitle tracks. */
export function TrackMenu({
  kind,
  tracks,
  selected,
  onSelect,
}: {
  kind: 'audio' | 'subtitle';
  tracks: readonly MediaTrack[];
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
