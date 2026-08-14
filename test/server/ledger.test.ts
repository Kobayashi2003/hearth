import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { Progress } from '@hearth/shared';

import { LedgerService } from '../../server/src/modules/ledger/ledger.service.js';

const temporaryDirectories: string[] = [];

function ledger(): LedgerService {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ledger-'));
  temporaryDirectories.push(directory);
  return new LedgerService(directory);
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

const at = (seconds: number): Progress => ({
  kind: 'time',
  at: seconds,
  total: 1400,
  percent: Math.round((seconds / 1400) * 100),
  savedAt: Date.now(),
});

describe('LedgerService.patch', () => {
  it('starts empty for a user who has never opened anything', () => {
    expect(ledger().read('nobody')).toEqual({ progress: {}, recent: [], pinned: [] });
  });

  it('records progress and reads it back', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'Anime/ep01.mkv': at(120) } });
    expect(service.read('mei').progress['Anime/ep01.mkv']?.at).toBe(120);
  });

  it('keeps each user apart', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'Anime/ep01.mkv': at(120) } });
    await service.patch('ren', { progress: { 'Anime/ep01.mkv': at(900) } });

    expect(service.read('mei').progress['Anime/ep01.mkv']?.at).toBe(120);
    expect(service.read('ren').progress['Anime/ep01.mkv']?.at).toBe(900);
  });

  it('forgets a position when patched with null', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'Anime/ep01.mkv': at(120) } });
    await service.patch('mei', { progress: { 'Anime/ep01.mkv': null } });
    expect(service.read('mei').progress).toEqual({});
  });

  it('moves a reopened file to the front of recent without duplicating it', async () => {
    const service = ledger();
    await service.patch('mei', { opened: 'a.mkv' });
    await service.patch('mei', { opened: 'b.mkv' });
    await service.patch('mei', { opened: 'a.mkv' });

    expect(service.read('mei').recent.map(entry => entry.path)).toEqual(['a.mkv', 'b.mkv']);
  });

  it('pins and unpins', async () => {
    const service = ledger();
    await service.patch('mei', { pin: { path: 'x.cbz', value: true } });
    expect(service.read('mei').pinned).toEqual(['x.cbz']);

    await service.patch('mei', { pin: { path: 'x.cbz', value: false } });
    expect(service.read('mei').pinned).toEqual([]);
  });

  it('survives a reload from disk', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ledger-'));
    temporaryDirectories.push(directory);

    await new LedgerService(directory).patch('mei', { progress: { 'a.mkv': at(60) } });
    expect(new LedgerService(directory).read('mei').progress['a.mkv']?.at).toBe(60);
  });

  it('writes a file per user with an unusual name safely', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ledger-'));
    temporaryDirectories.push(directory);
    const service = new LedgerService(directory);

    await service.patch('../etc/passwd', { progress: { 'a.mkv': at(60) } });

    expect(fs.readdirSync(directory)).toHaveLength(1);
    expect(service.read('../etc/passwd').progress['a.mkv']?.at).toBe(60);
  });
});

describe('LedgerService.reprefix', () => {
  it('follows a renamed file', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'Anime/ep01.mkv': at(120) } });
    await service.reprefix('Anime/ep01.mkv', 'Anime/episode-01.mkv');

    const { progress } = service.read('mei');
    expect(progress['Anime/ep01.mkv']).toBeUndefined();
    expect(progress['Anime/episode-01.mkv']?.at).toBe(120);
  });

  it('rewrites everything beneath a renamed folder', async () => {
    const service = ledger();
    await service.patch('mei', {
      progress: { 'Anime/SomeShow/ep03.mkv': at(1080), 'Anime/SomeShow/ep04.mkv': at(60) },
    });
    await service.reprefix('Anime/SomeShow', 'Anime/[Group] Some Show (2024)');

    const { progress } = service.read('mei');
    expect(progress['Anime/[Group] Some Show (2024)/ep03.mkv']?.at).toBe(1080);
    expect(progress['Anime/[Group] Some Show (2024)/ep04.mkv']?.at).toBe(60);
  });

  it('does not rewrite a sibling that merely starts with the same characters', async () => {
    const service = ledger();
    await service.patch('mei', {
      progress: { 'Anime/ep01.mkv': at(120), 'Anime Movies/film.mkv': at(300) },
    });
    await service.reprefix('Anime', 'Cartoons');

    const { progress } = service.read('mei');
    expect(progress['Cartoons/ep01.mkv']?.at).toBe(120);
    // The bug this test exists for: a naive startsWith would move this too.
    expect(progress['Anime Movies/film.mkv']?.at).toBe(300);
  });

  it('carries recent and pinned along with progress', async () => {
    const service = ledger();
    await service.patch('mei', { opened: 'Books/a.epub' });
    await service.patch('mei', { pin: { path: 'Books/a.epub', value: true } });
    await service.reprefix('Books', 'Library');

    const document = service.read('mei');
    expect(document.recent[0]?.path).toBe('Library/a.epub');
    expect(document.pinned).toEqual(['Library/a.epub']);
  });

  it('applies to every user, not only the one who made the move', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'Anime/ep01.mkv': at(120) } });
    await service.patch('ren', { progress: { 'Anime/ep01.mkv': at(900) } });
    await service.reprefix('Anime', 'Cartoons');

    expect(service.read('mei').progress['Cartoons/ep01.mkv']?.at).toBe(120);
    expect(service.read('ren').progress['Cartoons/ep01.mkv']?.at).toBe(900);
  });

  it('is a no-op when the path did not change', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'a.mkv': at(60) } });
    await service.reprefix('a.mkv', 'a.mkv');
    expect(service.read('mei').progress['a.mkv']?.at).toBe(60);
  });

  it('handles a backslash boundary, since Windows paths arrive that way', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'Anime\\ep01.mkv': at(120) } });
    await service.reprefix('Anime', 'Cartoons');
    expect(service.read('mei').progress['Cartoons\\ep01.mkv']?.at).toBe(120);
  });
});

describe('LedgerService.forget', () => {
  it('drops a permanently deleted folder and everything under it', async () => {
    const service = ledger();
    await service.patch('mei', {
      progress: { 'Old/a.mkv': at(60), 'Old/b.mkv': at(90), 'Keep/c.mkv': at(30) },
    });
    await service.forget('Old');

    expect(Object.keys(service.read('mei').progress)).toEqual(['Keep/c.mkv']);
  });

  it('leaves a same-prefixed sibling alone', async () => {
    const service = ledger();
    await service.patch('mei', { progress: { 'Old Stuff/a.mkv': at(60) } });
    await service.forget('Old');
    expect(service.read('mei').progress['Old Stuff/a.mkv']?.at).toBe(60);
  });
});
