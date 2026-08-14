import { describe, expect, it } from 'vitest';

import {
  RESUME_END_MARGIN_SECONDS,
  RESUME_FLOOR_SECONDS,
  phaseOf,
  positionToResume,
  positionToStore,
} from '../../web/src/features/mantel/resume';

const HOUR = 3600;

describe('phaseOf', () => {
  it('treats the opening seconds as not yet started', () => {
    expect(phaseOf(0, HOUR)).toBe('start');
    expect(phaseOf(RESUME_FLOOR_SECONDS - 0.1, HOUR)).toBe('start');
  });

  it('treats the body of the file as resumable', () => {
    expect(phaseOf(RESUME_FLOOR_SECONDS, HOUR)).toBe('middle');
    expect(phaseOf(HOUR / 2, HOUR)).toBe('middle');
  });

  it('treats the tail as played', () => {
    expect(phaseOf(HOUR - RESUME_END_MARGIN_SECONDS, HOUR)).toBe('end');
    expect(phaseOf(HOUR, HOUR)).toBe('end');
  });

  it('says nothing has started when the duration is unknown', () => {
    // The element reports 0 between tracks, and NaN before metadata arrives.
    expect(phaseOf(41, 0)).toBe('start');
    expect(phaseOf(41, Number.NaN)).toBe('start');
  });

  it('calls a file shorter than both thresholds finished only at its end', () => {
    // A ten-second clip: every position is below the floor, so nothing about it
    // is ever worth resuming.
    expect(phaseOf(0, 10)).toBe('start');
    expect(phaseOf(9.9, 10)).toBe('start');
  });
});

describe('positionToStore', () => {
  it('rewinds a track that was only sampled', () => {
    expect(positionToStore(8, HOUR)).toBe(0);
  });

  it('keeps the position in the middle', () => {
    expect(positionToStore(1200, HOUR)).toBe(1200);
  });

  it('records the tail as the full duration, so the file reads as finished', () => {
    expect(positionToStore(HOUR - 2, HOUR)).toBe(HOUR);
  });

  it('never records progress against an unknown duration', () => {
    // The bug this guards: on a playlist advance the new track's name arrived
    // before its duration, and the previous track's position was written under
    // it — marking an unplayed hour-long file as finished at 59 seconds.
    expect(positionToStore(59, 0)).toBe(0);
  });
});

describe('positionToResume', () => {
  it('starts over when the stored point was near the end', () => {
    expect(positionToResume(HOUR, HOUR)).toBe(0);
  });

  it('starts over when the stored point was near the beginning', () => {
    expect(positionToResume(3, HOUR)).toBe(0);
  });

  it('returns to the stored point in between', () => {
    expect(positionToResume(1200, HOUR)).toBe(1200);
  });

  it('starts over when the stored point exceeds a now-shorter file', () => {
    // The file was replaced by a shorter cut; 1200s into a 600s file is past
    // the end, which is the `end` phase, so it rewinds rather than seeking out
    // of range.
    expect(positionToResume(1200, 600)).toBe(0);
  });
});
