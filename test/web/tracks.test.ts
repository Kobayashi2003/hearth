import { describe, expect, it } from 'vitest';
import type { MediaTrack } from '@hearth/shared';

import { languageName, trackLabels } from '@/features/preview/viewers/video/tracks';

const track = (
  index: number,
  language: string | null,
  title: string | null = null,
): MediaTrack => ({
  index,
  codec: 'subrip',
  language,
  title,
});

describe('languageName', () => {
  it('reads ISO 639-2 codes, bibliographic ones included', () => {
    expect(languageName('jpn')).toBe('Japanese');
    expect(languageName('ger')).toBe('German');
    expect(languageName('deu')).toBe('German');
    expect(languageName('chi')).toBe('Chinese');
  });

  it('has no name for an undetermined or missing language', () => {
    expect(languageName('und')).toBeNull();
    expect(languageName(null)).toBeNull();
  });
});

describe('trackLabels', () => {
  it('keeps the language when a track also has a title', () => {
    const labels = trackLabels(
      [track(0, 'ger', 'Forced'), track(1, 'chi', 'Simplified')],
      'Subtitle',
    );
    expect(labels.get(0)).toBe('German · Forced');
    expect(labels.get(1)).toBe('Chinese · Simplified');
  });

  it('numbers tracks that would otherwise read the same', () => {
    const labels = trackLabels(
      [track(0, 'eng'), track(1, 'eng'), track(2, 'eng', 'SDH')],
      'Subtitle',
    );
    expect([...labels.values()]).toEqual(['English 1', 'English 2', 'English · SDH']);
  });

  it('drops a title that only repeats the language', () => {
    expect(trackLabels([track(0, 'jpn', 'Japanese')], 'Track').get(0)).toBe('Japanese');
  });

  it('falls back to a numbered track when nothing describes it', () => {
    expect(trackLabels([track(3, 'und')], 'Track').get(3)).toBe('Track 4');
  });
});
