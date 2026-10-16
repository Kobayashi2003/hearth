import type { CueTrack } from '@hearth/shared';

/** CD frames: a cue sheet counts time in 75ths of a second. */
const FRAMES_PER_SECOND = 75;

export interface ParsedCue {
  title: string | null;
  performer: string | null;
  date: string | null;
  /** In the order the sheet names them; an album ripped to one file has one. */
  files: Array<{ name: string; tracks: CueTrack[] }>;
}

interface TrackDraft {
  number: number;
  title: string | null;
  performer: string | null;
  start: number | null;
}

/** Where the sheet is up to: the FILE and the TRACK the next lines belong to. */
interface Reading {
  sheet: ParsedCue;
  file: ParsedCue['files'][number] | null;
  track: TrackDraft | null;
}

/** One line: its command's words after the command, and the rest of the line unquoted. */
type Command = (state: Reading, words: string[], argument: string) => void;

/**
 * The commands that matter for playback; the rest (FLAGS, ISRC, CATALOG,
 * pregaps) are ignored. Before the first TRACK a TITLE or PERFORMER is the
 * album's.
 */
const COMMANDS: Record<string, Command> = {
  FILE(state, _words, argument) {
    finishTrack(state);
    state.file = { name: fileName(argument), tracks: [] };
    state.sheet.files.push(state.file);
  },
  TRACK(state, words) {
    finishTrack(state);
    const number = Number.parseInt(words[0] ?? '', 10) || 0;
    state.track = { number, title: null, performer: null, start: null };
  },
  INDEX(state, words) {
    if (state.track && words[0] === '01') state.track.start = timeOf(words[1] ?? '');
  },
  TITLE(state, _words, argument) {
    (state.track ?? state.sheet).title = unquote(argument) || null;
  },
  PERFORMER(state, _words, argument) {
    (state.track ?? state.sheet).performer = unquote(argument) || null;
  },
  REM(state, words) {
    if (words[0]?.toUpperCase() === 'DATE')
      state.sheet.date = unquote(words.slice(1).join(' ')) || null;
  },
};

/** A track without an INDEX 01 cannot be reached and is left out. */
export function parseCue(text: string): ParsedCue {
  const state: Reading = {
    sheet: { title: null, performer: null, date: null, files: [] },
    file: null,
    track: null,
  };
  for (const line of text.split(/\r?\n/)) {
    const [command = '', ...words] = line.trim().split(/\s+/);
    COMMANDS[command.toUpperCase()]?.(state, words, line.trim().slice(command.length).trim());
  }
  finishTrack(state);
  const { sheet } = state;
  for (const file of sheet.files) {
    for (const track of file.tracks)
      if (track.performer === sheet.performer) track.performer = null;
  }
  return sheet;
}

function finishTrack(state: Reading): void {
  const { track, file } = state;
  if (track && file && track.start !== null) file.tracks.push({ ...track, start: track.start });
  state.track = null;
}

/** `FILE "Disc 1.wav" WAVE`: the name, without the type after it. */
function fileName(argument: string): string {
  const quoted = /^"([^"]*)"/.exec(argument);
  return quoted ? quoted[1]! : argument.replace(/\s+\S+$/, '');
}

function unquote(value: string): string {
  const quoted = /^"(.*)"$/.exec(value);
  return (quoted ? quoted[1]! : value).trim();
}

/** `mm:ss:ff`, minutes allowed past 59. */
function timeOf(value: string): number | null {
  const parts = /^(\d+):(\d{1,2}):(\d{1,2})$/.exec(value);
  if (!parts) return null;
  const [, minutes, seconds, frames] = parts.map(Number) as [number, number, number, number];
  return minutes * 60 + seconds + frames / FRAMES_PER_SECOND;
}
