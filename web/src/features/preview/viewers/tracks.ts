import type { MediaTrack } from '@hearth/shared';

import { local } from '@/lib/storage';

const AUDIO_KEY = 'hearth.audioLanguage';
const SUBTITLE_KEY = 'hearth.subtitleLanguage';

const languageNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

/**
 * "Japanese" for "jpn" (bibliographic codes such as "ger" included), null for
 * "und". Preferences compare names, so "ger" and "deu" are the same language.
 */
export function languageName(code: string | null): string | null {
  if (!code || code === 'und') return null;
  try {
    return languageNames.of(code) ?? null;
  } catch {
    return null;
  }
}

function isForced(track: MediaTrack): boolean {
  return /forced/i.test(track.title ?? '');
}

/**
 * "German · Forced", "Chinese · Simplified", "Japanese". A title that only
 * repeats the language is dropped; tracks that would read the same are numbered.
 */
export function trackLabels(tracks: readonly MediaTrack[], fallback: string): Map<number, string> {
  const base = tracks.map(track => {
    const language = languageName(track.language);
    const title = track.title?.trim();
    if (language && title && title.toLowerCase() !== language.toLowerCase()) {
      return `${language} · ${title}`;
    }
    return language ?? title ?? `${fallback} ${track.index + 1}`;
  });
  const totals = new Map<string, number>();
  for (const label of base) totals.set(label, (totals.get(label) ?? 0) + 1);
  const seen = new Map<string, number>();
  return new Map(
    tracks.map((track, position) => {
      const label = base[position]!;
      if (totals.get(label)! < 2) return [track.index, label];
      const count = (seen.get(label) ?? 0) + 1;
      seen.set(label, count);
      return [track.index, `${label} ${count}`];
    }),
  );
}

/** The audio track in the language picked last time, else the file's first. */
export function preferredAudio(tracks: readonly MediaTrack[]): number {
  const wanted = local.get(AUDIO_KEY);
  const match = wanted ? tracks.find(track => languageName(track.language) === wanted) : undefined;
  return match?.index ?? tracks[0]?.index ?? 0;
}

export function rememberAudio(track: MediaTrack | undefined): void {
  const name = languageName(track?.language ?? null);
  if (name) local.set(AUDIO_KEY, name);
}

interface SubtitlePreference {
  language: string | null;
  forced: boolean;
}

/** Off unless subtitles were turned on last time; then the same language, forced or full as before. */
export function preferredSubtitle(tracks: readonly MediaTrack[]): number | null {
  let wanted: SubtitlePreference | null = null;
  try {
    wanted = JSON.parse(local.get(SUBTITLE_KEY) ?? 'null') as SubtitlePreference | null;
  } catch {
    return null;
  }
  if (!wanted?.language) return null;
  const sameLanguage = tracks.filter(track => languageName(track.language) === wanted.language);
  const match = sameLanguage.find(track => isForced(track) === wanted.forced) ?? sameLanguage[0];
  return match?.index ?? null;
}

export function rememberSubtitle(track: MediaTrack | undefined): void {
  const preference: SubtitlePreference = {
    language: languageName(track?.language ?? null),
    forced: track ? isForced(track) : false,
  };
  local.set(SUBTITLE_KEY, JSON.stringify(preference));
}
