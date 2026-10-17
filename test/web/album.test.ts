// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { CueSheet } from '@hearth/shared';

import { albumOf, skipTarget, trackAt } from '@/features/preview/audio/album';

const SHEET: CueSheet = {
  kind: 'tracks',
  title: 'Album',
  performer: 'Band',
  date: null,
  tracks: [
    { number: 1, title: 'One', performer: null, start: 0 },
    { number: 2, title: 'Two', performer: null, start: 20 },
    { number: 3, title: 'Three', performer: null, start: 45 },
  ],
};

describe('an album ripped to one file', () => {
  it('knows which track a moment is in, and where the last one ends', () => {
    expect([0, 19.9, 20, 44, 45, 70].map(at => trackAt(SHEET.tracks, at))).toEqual([
      0, 0, 1, 1, 2, 2,
    ]);
    expect(albumOf(SHEET, 50, 80).tracks.map(track => track.end)).toEqual([20, 45, 80]);
  });

  it('goes to the next track, and hands over to the next file after the last', () => {
    expect(skipTarget(albumOf(SHEET, 5, 80), 5, 1, null)).toBe(20);
    expect(skipTarget(albumOf(SHEET, 50, 80), 50, 1, null)).toBeNull();
  });

  it('restarts a track a few seconds in, else goes to the one before', () => {
    expect(skipTarget(albumOf(SHEET, 30, 80), 30, -1, null)).toBe(20);
    expect(skipTarget(albumOf(SHEET, 21, 80), 21, -1, null)).toBe(0);
    // The first track's start is where the previous file takes over.
    expect(skipTarget(albumOf(SHEET, 1, 80), 1, -1, null)).toBeNull();
  });

  it('shuffles among its own tracks', () => {
    expect(skipTarget(albumOf(SHEET, 5, 80), 5, 1, 0.99)).toBe(45);
  });
});
