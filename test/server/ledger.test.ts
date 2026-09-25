import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { Progress } from '@hearth/shared';

import { LedgerService } from '../../server/src/modules/ledger/ledger.service.js';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-ledger-'));
  temporaryDirectories.push(directory);
  return directory;
}

function ledger(): LedgerService {
  return new LedgerService(temporaryDirectory());
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

describe('LedgerService progress', () => {
  it('starts empty for a user who has never opened anything', () => {
    expect(ledger().readProgress('nobody')).toEqual({});
  });

  it('records progress and reads it back', async () => {
    const service = ledger();
    await service.patchProgress('mei', { 'Anime/ep01.mkv': at(120) });
    expect(service.readProgress('mei')['Anime/ep01.mkv']?.at).toBe(120);
  });

  it('keeps each user apart', async () => {
    const service = ledger();
    await service.patchProgress('mei', { 'Anime/ep01.mkv': at(120) });
    await service.patchProgress('ren', { 'Anime/ep01.mkv': at(900) });

    expect(service.readProgress('mei')['Anime/ep01.mkv']?.at).toBe(120);
    expect(service.readProgress('ren')['Anime/ep01.mkv']?.at).toBe(900);
  });

  it('forgets a position when patched with null', async () => {
    const service = ledger();
    await service.patchProgress('mei', { 'Anime/ep01.mkv': at(120) });
    await service.patchProgress('mei', { 'Anime/ep01.mkv': null });
    expect(service.readProgress('mei')).toEqual({});
  });

  it('survives a reload from disk', async () => {
    const directory = temporaryDirectory();
    await new LedgerService(directory).patchProgress('mei', { 'a.mkv': at(60) });
    expect(new LedgerService(directory).readProgress('mei')['a.mkv']?.at).toBe(60);
  });

  it('writes a file per user with an unusual name safely', async () => {
    const directory = temporaryDirectory();
    const service = new LedgerService(directory);
    await service.patchProgress('../etc/passwd', { 'a.mkv': at(60) });

    expect(fs.readdirSync(path.join(directory, 'progress'))).toHaveLength(1);
    expect(service.readProgress('../etc/passwd')['a.mkv']?.at).toBe(60);
  });

  it('migrates a pre-2.0 ledger file and drops recent/pinned', async () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(
      path.join(directory, 'mei.json'),
      JSON.stringify({
        progress: { 'a.mkv': at(60) },
        recent: [{ path: 'a.mkv', openedAt: 1 }],
        pinned: ['a.mkv'],
      }),
    );
    const service = new LedgerService(directory);
    await service.migrate();

    expect(service.readProgress('mei')).toEqual({ 'a.mkv': expect.objectContaining({ at: 60 }) });
    expect(fs.existsSync(path.join(directory, 'mei.json'))).toBe(false);
  });
});

describe('LedgerService reading sessions', () => {
  it('stores an opaque record per file and removes it', async () => {
    const service = ledger();
    await service.saveSession('mei', 'Books/a.epub', { locator: { spineIndex: 3 } });
    expect(service.readSession('mei', 'Books/a.epub')).toEqual({ locator: { spineIndex: 3 } });
    expect(service.readSession('mei', 'Books/b.epub')).toBeNull();

    await service.removeSession('mei', 'Books/a.epub');
    expect(service.readSession('mei', 'Books/a.epub')).toBeNull();
  });

  it('refuses a record over the configured size, and accepts any size when unlimited', async () => {
    const capped = new LedgerService(temporaryDirectory(), {
      maxProgressEntries: 10,
      maxSessions: 10,
      maxSessionBytes: 512 * 1024,
    });
    await expect(capped.saveSession('mei', 'a.epub', 'x'.repeat(600 * 1024))).rejects.toThrow(
      /too large/,
    );
    await expect(
      ledger().saveSession('mei', 'a.epub', 'x'.repeat(600 * 1024)),
    ).resolves.toBeUndefined();
  });

  it('keeps only the newest positions when capped', async () => {
    const capped = new LedgerService(temporaryDirectory(), {
      maxProgressEntries: 2,
      maxSessions: 2,
      maxSessionBytes: Number.POSITIVE_INFINITY,
    });
    await capped.patchProgress('mei', { 'a.mkv': { ...at(1), savedAt: 1 } });
    await capped.patchProgress('mei', { 'b.mkv': { ...at(2), savedAt: 2 } });
    await capped.patchProgress('mei', { 'c.mkv': { ...at(3), savedAt: 3 } });
    expect(Object.keys(capped.readProgress('mei')).sort()).toEqual(['b.mkv', 'c.mkv']);
  });
});

describe('LedgerService with hostile keys', () => {
  it('stores "__proto__" as an ordinary path and never touches the prototype', async () => {
    const service = ledger();
    expect(service.readSession('mei', '__proto__')).toBeNull();
    await service.saveSession('mei', '__proto__', { locator: 1 });
    await service.patchProgress('mei', { __proto__: at(5) } as unknown as Record<
      string,
      ReturnType<typeof at>
    >);
    await service.reprefix('__proto__', 'renamed');

    expect(service.readSession('mei', 'renamed')).toEqual({ locator: 1 });
    expect(Object.getPrototypeOf(service.readProgress('mei'))).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).locator).toBeUndefined();
  });
});

describe('LedgerService.reprefix', () => {
  it('follows a renamed file', async () => {
    const service = ledger();
    await service.patchProgress('mei', { 'Anime/ep01.mkv': at(120) });
    await service.reprefix('Anime/ep01.mkv', 'Anime/episode-01.mkv');

    const progress = service.readProgress('mei');
    expect(progress['Anime/ep01.mkv']).toBeUndefined();
    expect(progress['Anime/episode-01.mkv']?.at).toBe(120);
  });

  it('rewrites everything beneath a renamed folder', async () => {
    const service = ledger();
    await service.patchProgress('mei', {
      'Anime/Show/ep03.mkv': at(1080),
      'Anime/Show/ep04.mkv': at(60),
    });
    await service.reprefix('Anime/Show', 'Anime/[Group] Show (2024)');

    const progress = service.readProgress('mei');
    expect(progress['Anime/[Group] Show (2024)/ep03.mkv']?.at).toBe(1080);
    expect(progress['Anime/[Group] Show (2024)/ep04.mkv']?.at).toBe(60);
  });

  it('does not rewrite a sibling that merely starts with the same characters', async () => {
    const service = ledger();
    await service.patchProgress('mei', {
      'Anime/ep01.mkv': at(120),
      'Anime Movies/film.mkv': at(300),
    });
    await service.reprefix('Anime', 'Cartoons');

    const progress = service.readProgress('mei');
    expect(progress['Cartoons/ep01.mkv']?.at).toBe(120);
    expect(progress['Anime Movies/film.mkv']?.at).toBe(300);
  });

  it('carries reading sessions along with progress', async () => {
    const service = ledger();
    await service.saveSession('mei', 'Books/a.epub', { locator: 1 });
    await service.reprefix('Books', 'Library');
    expect(service.readSession('mei', 'Library/a.epub')).toEqual({ locator: 1 });
  });

  it('applies to every user, not only the one who made the move', async () => {
    const service = ledger();
    await service.patchProgress('mei', { 'Anime/ep01.mkv': at(120) });
    await service.patchProgress('ren', { 'Anime/ep01.mkv': at(900) });
    await service.reprefix('Anime', 'Cartoons');

    expect(service.readProgress('mei')['Cartoons/ep01.mkv']?.at).toBe(120);
    expect(service.readProgress('ren')['Cartoons/ep01.mkv']?.at).toBe(900);
  });

  it('handles a backslash boundary', async () => {
    const service = ledger();
    await service.patchProgress('mei', { 'Anime\\ep01.mkv': at(120) });
    await service.reprefix('Anime', 'Cartoons');
    expect(service.readProgress('mei')['Cartoons\\ep01.mkv']?.at).toBe(120);
  });
});

describe('LedgerService.forget', () => {
  it('drops a deleted folder and everything under it, but not a same-prefixed sibling', async () => {
    const service = ledger();
    await service.patchProgress('mei', {
      'Old/a.mkv': at(60),
      'Old/b.mkv': at(90),
      'Old Stuff/c.mkv': at(30),
    });
    await service.forget('Old');
    expect(Object.keys(service.readProgress('mei'))).toEqual(['Old Stuff/c.mkv']);
  });
});
