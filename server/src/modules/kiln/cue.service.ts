import fsp from 'node:fs/promises';
import path from 'node:path';

import type { CueSheet } from '@hearth/shared';

import type { FfmpegAdapter } from '../../adapters/ffmpeg/ffmpeg.js';
import { decodeText } from '../../lib/charset.js';
import type { SafePath } from '../../lib/vault.js';
import { parseCue, type ParsedCue } from './cue.js';

/** A cue sheet is a few kilobytes; anything far larger is not one. */
const MAX_CUE_BYTES = 512 * 1024;
/** A folder of many cue sheets is a folder of many albums; the matching one is named after its audio. */
const MAX_CANDIDATES = 16;
/** Formats that carry a cue sheet inside them as a tag. */
const EMBEDDING = new Set(['.flac', '.wv', '.ape', '.tta']);

/**
 * Finds the tracks of an album ripped to one file. The sheet is beside it
 * (named after it, or naming it in a FILE line) or, in a FLAC, embedded. Like
 * a folder cover, a sheet beside the file is read with the file's own access.
 */
export class CueService {
  constructor(private readonly ffmpeg: FfmpegAdapter) {}

  /** Null when the file is not an album: no sheet, or one with fewer than two tracks for it. */
  async sheetFor(target: SafePath, signal?: AbortSignal): Promise<CueSheet | null> {
    for (const candidate of await this.candidatesFor(target)) {
      const parsed = await readSheet(candidate);
      const sheet = parsed && sheetForFile(parsed, target, isNamedAfter(candidate, target));
      if (sheet) return sheet;
    }
    if (!EMBEDDING.has(path.extname(target).toLowerCase())) return null;
    const tags = await this.ffmpeg.formatTags(target, signal).catch(() => ({}));
    const embedded = Object.entries(tags).find(([key]) => key.toLowerCase() === 'cuesheet')?.[1];
    return embedded ? sheetForFile(parseCue(embedded), target, true) : null;
  }

  /** Sheets named after the file first, then the others in the folder. */
  private async candidatesFor(target: string): Promise<string[]> {
    const directory = path.dirname(target);
    const names = await fsp.readdir(directory).catch(() => [] as string[]);
    return names
      .filter(name => name.toLowerCase().endsWith('.cue'))
      .map(name => path.join(directory, name))
      .sort((a, b) => Number(isNamedAfter(b, target)) - Number(isNamedAfter(a, target)))
      .slice(0, MAX_CANDIDATES);
  }
}

async function readSheet(file: string): Promise<ParsedCue | null> {
  try {
    const stats = await fsp.stat(file);
    if (!stats.isFile() || stats.size > MAX_CUE_BYTES) return null;
    return parseCue(decodeText(await fsp.readFile(file)));
  } catch {
    return null;
  }
}

/**
 * The tracks a sheet gives this file. A FILE line names the file the sheet was
 * ripped to, often a .wav since converted to FLAC, so the name is compared
 * without its extension; a sheet named after the file and naming a single file
 * is trusted even when that name was never updated.
 */
function sheetForFile(sheet: ParsedCue, target: string, namedAfter: boolean): CueSheet | null {
  const stem = stemOf(target);
  const file =
    sheet.files.find(candidate => stemOf(candidate.name) === stem) ??
    (namedAfter && sheet.files.length === 1 ? sheet.files[0] : undefined);
  if (!file || file.tracks.length < 2) return null;
  return { title: sheet.title, performer: sheet.performer, date: sheet.date, tracks: file.tracks };
}

/** `Album.cue` or `Album.flac.cue` for `Album.flac`. */
function isNamedAfter(cue: string, target: string): boolean {
  const name = path.basename(cue, path.extname(cue)).toLowerCase();
  const base = path.basename(target).toLowerCase();
  return name === base || name === stemOf(target);
}

/** The base name without extension, lower-cased; FILE lines may use either slash. */
function stemOf(file: string): string {
  const base = file.split(/[/\\]/).at(-1) ?? file;
  return path.parse(base).name.toLowerCase();
}
