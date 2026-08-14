/**
 * Where a track should be recorded, and where it should start again.
 *
 * Kept apart from the player so the rules can be read — and tested — without a
 * media element. The two directions are deliberately not symmetric: writing
 * records the tail as *finished*, while reading refuses to resume there, so a
 * track played to the end starts over rather than opening three seconds from
 * the credits.
 */

/** Below this, you were still deciding whether to listen. */
export const RESUME_FLOOR_SECONDS = 20;
/** Within this of the end, you were finished. */
export const RESUME_END_MARGIN_SECONDS = 15;

export type ResumePhase = 'start' | 'middle' | 'end';

export function phaseOf(positionSeconds: number, durationSeconds: number): ResumePhase {
  if (!(durationSeconds > 0)) return 'start';
  if (positionSeconds < RESUME_FLOOR_SECONDS) return 'start';
  if (positionSeconds >= durationSeconds - RESUME_END_MARGIN_SECONDS) return 'end';
  return 'middle';
}

/**
 * The position to store. Three cases, not two: collapsing `start` into `end`
 * would mark a track you sampled for ten seconds as played to the end, and the
 * folder would show it complete.
 */
export function positionToStore(positionSeconds: number, durationSeconds: number): number {
  switch (phaseOf(positionSeconds, durationSeconds)) {
    case 'start':
      return 0;
    case 'end':
      return durationSeconds;
    default:
      return positionSeconds;
  }
}

/** The position to start from, given what was stored and how long the file is. */
export function positionToResume(storedAt: number, durationSeconds: number): number {
  return phaseOf(storedAt, durationSeconds) === 'middle' ? storedAt : 0;
}
