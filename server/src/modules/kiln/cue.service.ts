import fsp from 'node:fs/promises';
import path from 'node:path';

import type { CueSheet } from '@hearth/shared';

import type { FfmpegAdapter, TagsAndChapters } from '../../adapters/ffmpeg/ffmpeg.js';
import { decodeText } from '../../lib/charset.js';
import type { SafePath } from '../../lib/vault.js';
import { parseCue, type ParsedCue } from './cue.js';

/** A cue sheet is a few kilobytes; anything far larger is not one. */
const MAX_CUE_BYTES = 512 * 1024;
/** A folder of many cue sheets is a folder of many albums; the matching one is named after its audio. */
const MAX_CANDIDATES = 16;

/**
 * The tracks of a file that holds many: an album ripped to one file, from its
 * cue sheet beside it (named after it, or naming it in a FILE line) or
 * embedded in it (a FLAC's CUESHEET tag); otherwise the file's own chapters,
 * as an audiobook (.m4b) has. Like a folder cover, a sheet beside the file is
 * read with the file's own access.
 */
export class CueService {
  constructor(private readonly ffmpeg: FfmpegAdapter) {}

  /** Null when the file is just one track: nothing found, or fewer than two tracks. */
  async sheetFor(target: SafePath, signal?: AbortSignal): Promise<CueSheet | null> {
    for (const candidate of await this.candidatesFor(target)) {
      const parsed = await readSheet(candidate);
      const sheet = parsed && sheetForFile(parsed, target, isNamedAfter(candidate, target));
      if (sheet) return sheet;
    }
    const inside = await this.ffmpeg.tagsAndChapters(target, signal).catch(() => null);
    if (!inside) return null;
    // An embedded sheet that does not describe this file gives way to the file's own chapters.
    const embedded = tagOf(inside.tags, 'cuesheet');
    return (embedded && sheetForFile(parseCue(embedded), target, true)) || chapterSheet(inside);
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
  return {
    kind: 'tracks',
    title: sheet.title,
    performer: sheet.performer,
    date: sheet.date,
    tracks: file.tracks,
  };
}

/** An audiobook's chapters as tracks: the book is the album, its author the performer. */
export function chapterSheet({ tags, chapters }: TagsAndChapters): CueSheet | null {
  if (chapters.length < 2) return null;
  return {
    kind: 'chapters',
    title: tagOf(tags, 'album') ?? tagOf(tags, 'title'),
    performer: tagOf(tags, 'artist') ?? tagOf(tags, 'album_artist'),
    date: tagOf(tags, 'date'),
    tracks: chapters.map((chapter, index) => ({
      number: index + 1,
      title: chapter.title,
      performer: null,
      start: chapter.start,
    })),
  };
}

/** Containers spell tag names in their own case (FLAC's TITLE, MP4's title). */
function tagOf(tags: Record<string, string>, name: string): string | null {
  const value = Object.entries(tags)
    .find(([key]) => key.toLowerCase() === name)?.[1]
    ?.trim();
  return value || null;
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
