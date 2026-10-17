import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import iconv from 'iconv-lite';
import { afterEach, describe, expect, it } from 'vitest';

import type { FfmpegAdapter, TagsAndChapters } from '../../server/src/adapters/ffmpeg/ffmpeg.js';
import type { SafePath } from '../../server/src/lib/vault.js';
import { parseCue } from '../../server/src/modules/kiln/cue.js';
import { CueService } from '../../server/src/modules/kiln/cue.service.js';

const ALBUM = `REM GENRE Classical
REM DATE 1999
PERFORMER "Orchestra"
TITLE "Symphony No. 9"
FILE "Symphony.wav" WAVE
  TRACK 01 AUDIO
    TITLE "I. Allegro"
    PERFORMER "Orchestra"
    INDEX 01 00:00:00
  TRACK 02 AUDIO
    TITLE "II. Molto vivace"
    PERFORMER "Soloist"
    INDEX 00 15:58:40
    INDEX 01 16:00:00
  TRACK 03 AUDIO
    TITLE "III. Adagio"
    INDEX 01 27:30:37
`;

describe('parseCue', () => {
  it('reads the album, its tracks and when each starts', () => {
    const sheet = parseCue(ALBUM);
    expect(sheet).toMatchObject({ title: 'Symphony No. 9', performer: 'Orchestra', date: '1999' });
    expect(sheet.files).toHaveLength(1);
    expect(sheet.files[0]!.name).toBe('Symphony.wav');
    expect(sheet.files[0]!.tracks).toEqual([
      // The album's own performer is not repeated on its tracks.
      { number: 1, title: 'I. Allegro', performer: null, start: 0 },
      // INDEX 01, not the pregap at INDEX 00.
      { number: 2, title: 'II. Molto vivace', performer: 'Soloist', start: 960 },
      { number: 3, title: 'III. Adagio', performer: null, start: 27 * 60 + 30 + 37 / 75 },
    ]);
  });

  it('keeps tracks with the file they belong to, and drops one that never starts', () => {
    const sheet = parseCue(
      'FILE "a.flac" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\nTRACK 02 AUDIO\n' +
        'FILE "b.flac" WAVE\nTRACK 03 AUDIO\nINDEX 01 00:00:00\n',
    );
    expect(sheet.files.map(file => [file.name, file.tracks.map(track => track.number)])).toEqual([
      ['a.flac', [1]],
      ['b.flac', [3]],
    ]);
  });
});

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

/** A folder holding the given files, and the service with an ffmpeg that reports `tags`. */
function album(files: Record<string, string | Buffer>, inside: Partial<TagsAndChapters> = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-cue-'));
  directories.push(directory);
  for (const [name, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(directory, name), content);
  }
  const ffmpeg = {
    tagsAndChapters: async () => ({ tags: {}, chapters: [], ...inside }),
  } as unknown as FfmpegAdapter;
  const at = (name: string) => path.join(directory, name) as SafePath;
  return { service: new CueService(ffmpeg), at };
}

describe('CueService', () => {
  it('finds the sheet named after the file, though it names the .wav it was ripped to', async () => {
    const { service, at } = album({ 'Symphony.flac': '', 'Symphony.cue': ALBUM });
    const sheet = await service.sheetFor(at('Symphony.flac'));
    expect(sheet?.tracks.map(track => track.title)).toEqual([
      'I. Allegro',
      'II. Molto vivace',
      'III. Adagio',
    ]);
  });

  it('finds a sheet by the FILE it names, and reads it in its own code page', async () => {
    const chinese = ALBUM.replace('Symphony No. 9', '第九交响曲').replace(
      'Symphony.wav',
      'CDImage.ape',
    );
    const { service, at } = album({
      'CDImage.ape': '',
      'Other album.cue': 'FILE "Other.flac" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\n',
      '第九.cue': iconv.encode(chinese, 'gbk'),
    });
    expect((await service.sheetFor(at('CDImage.ape')))?.title).toBe('第九交响曲');
  });

  it('is not an album when the sheet gives the file one track, or there is no sheet', async () => {
    const { service, at } = album({
      '01.flac': '',
      '02.flac': '',
      'Album.cue':
        'FILE "01.flac" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\n' +
        'FILE "02.flac" WAVE\nTRACK 02 AUDIO\nINDEX 01 00:00:00\n',
    });
    expect(await service.sheetFor(at('01.flac'))).toBeNull();
    expect(await album({ 'Song.mp3': '' }).service.sheetFor(at('Song.mp3'))).toBeNull();
  });

  it('reads a sheet embedded in a FLAC when none is beside it', async () => {
    const { service, at } = album({ 'Rip.flac': '' }, { tags: { CUESHEET: ALBUM } });
    expect((await service.sheetFor(at('Rip.flac')))?.tracks).toHaveLength(3);
  });

  it("lists an audiobook's own chapters when there is no cue sheet", async () => {
    const { service, at } = album(
      { 'Book.m4b': '' },
      {
        tags: { title: 'Part One', album: 'The Book', artist: 'The Author', date: '2020' },
        chapters: [
          { start: 0, title: 'Opening Credits' },
          { start: 31.5, title: 'Chapter 1' },
          { start: 1820, title: null },
        ],
      },
    );
    expect(await service.sheetFor(at('Book.m4b'))).toEqual({
      kind: 'chapters',
      title: 'The Book',
      performer: 'The Author',
      date: '2020',
      tracks: [
        { number: 1, title: 'Opening Credits', performer: null, start: 0 },
        { number: 2, title: 'Chapter 1', performer: null, start: 31.5 },
        { number: 3, title: null, performer: null, start: 1820 },
      ],
    });
  });

  it('falls back to the chapters when an embedded sheet is for another file', async () => {
    const { service, at } = album(
      { 'Book.m4b': '' },
      {
        tags: { CUESHEET: 'FILE "Other.wav" WAVE\nTRACK 01 AUDIO\nINDEX 01 00:00:00\n' },
        chapters: [
          { start: 0, title: 'One' },
          { start: 60, title: 'Two' },
        ],
      },
    );
    expect((await service.sheetFor(at('Book.m4b')))?.kind).toBe('chapters');
  });

  it('is not an album with a single chapter', async () => {
    const { service, at } = album({ 'Song.m4a': '' }, { chapters: [{ start: 0, title: 'Song' }] });
    expect(await service.sheetFor(at('Song.m4a'))).toBeNull();
  });
});
