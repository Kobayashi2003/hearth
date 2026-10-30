import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FileEntry } from '@hearth/shared';

import { buildApp, type HearthApp } from '../../server/src/app.js';
import type { AppConfig } from '../../server/src/config/index.js';
import { loadConfig } from '../../server/src/config/index.js';
import type { RuntimeState } from '../../server/src/config/runtime-state.js';
import type { SafePath } from '../../server/src/lib/vault.js';
import { ArchiveMemberService } from '../../server/src/modules/kiln/archive-member.service.js';
import type { ArchiveService } from '../../server/src/modules/kiln/archive.service.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

/** The cache service over a fake archive whose every member reads as `bytes`. */
function members({ on = true, bytes = 'hello' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-members-'));
  directories.push(directory);
  const read = vi.fn(async (_archive: string, member: string) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return { content: Buffer.from(bytes), name: path.posix.basename(member) };
  });
  const config = { media: { archiveMemberCacheDirectory: directory } } as AppConfig;
  const runtime = { get: () => on } as unknown as RuntimeState;
  const service = new ArchiveMemberService(config, runtime, { read } as unknown as ArchiveService);
  return { service, read };
}

const archive = 'C:/library/book.zip' as SafePath;
const archiveEntry: FileEntry = {
  name: 'book.zip',
  path: 'library/book.zip',
  size: 1234,
  mtime: '2026-10-01T00:00:00.000Z',
  mimeType: 'application/zip',
  isDirectory: false,
};

describe('a file inside an archive', () => {
  it('is unpacked once, and opened as a file of its own', async () => {
    const { service, read } = members();
    const [first, second] = await Promise.all([
      service.open(archive, archiveEntry, 'pages/01.jpg'),
      service.open(archive, archiveEntry, 'pages/01.jpg'),
    ]);
    const again = await service.open(archive, archiveEntry, 'pages/01.jpg');

    expect(read).toHaveBeenCalledTimes(1);
    expect(second.target).toBe(first.target);
    expect(again.target).toBe(first.target);
    expect(fs.readFileSync(first.target, 'utf8')).toBe('hello');
    expect(first.entry).toMatchObject({ name: '01.jpg', size: 5, mimeType: 'image/jpeg' });
  });

  it('is unpacked again once the archive changes', async () => {
    const { service, read } = members();
    await service.open(archive, archiveEntry, 'a.txt');
    await service.open(archive, { ...archiveEntry, mtime: '2026-10-02T00:00:00.000Z' }, 'a.txt');
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('is refused while the administrator has it turned off', async () => {
    const { service, read } = members({ on: false });
    await expect(service.open(archive, archiveEntry, 'a.txt')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(read).not.toHaveBeenCalled();
  });
});

describe('pictures for a covers view', () => {
  it("unpacks all of an archive's pictures in one reading, then serves each from there", async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-pictures-'));
    directories.push(directory);
    const listed = [
      { name: 'a.jpg', mimeType: 'image/jpeg', isDirectory: false, encrypted: false },
      { name: 'b.png', mimeType: 'image/png', isDirectory: false, encrypted: false },
      { name: 'locked.jpg', mimeType: 'image/jpeg', isDirectory: false, encrypted: true },
      { name: 'notes.txt', mimeType: 'text/plain', isDirectory: false, encrypted: false },
    ];
    const unpack = vi.fn(async (_archive: string, members: { name: string; file: string }[]) => {
      for (const { file } of members) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'picture');
      }
      return members.map(member => member.name);
    });
    const read = vi.fn();
    const archives = { list: async () => ({ entries: listed }), unpack, read };
    const service = new ArchiveMemberService(
      { media: { archiveMemberCacheDirectory: directory } } as AppConfig,
      { get: () => true } as unknown as RuntimeState,
      archives as unknown as ArchiveService,
    );

    await Promise.all([
      service.openPicture(archive, archiveEntry, 'a.jpg'),
      service.openPicture(archive, archiveEntry, 'b.png'),
    ]);
    await service.openPicture(archive, archiveEntry, 'a.jpg');

    expect(unpack).toHaveBeenCalledTimes(1);
    expect(unpack.mock.calls[0]![1].map(member => member.name)).toEqual(['a.jpg', 'b.png']);
    expect(read).not.toHaveBeenCalled();
  });
});

describe('asking for a file inside an archive over HTTP', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-member-http-'));
  const saved = { ...process.env };
  let app: HearthApp;
  let cookie = '';

  beforeAll(async () => {
    fs.mkdirSync(path.join(base, 'root'), { recursive: true });
    fs.writeFileSync(path.join(base, 'root', 'notes.txt'), 'not an archive');
    for (const key of Object.keys(process.env))
      if (key.startsWith('HEARTH_')) delete process.env[key];
    Object.assign(process.env, {
      HEARTH_ROOT_DIRECTORIES: path.join(base, 'root'),
      HEARTH_DATA_DIRECTORY: path.join(base, 'data'),
      HEARTH_TEMP_DIRECTORY: path.join(base, 'temp'),
      HEARTH_USERS_FILE: path.join(base, 'data', 'users.json'),
      HEARTH_PERMISSIONS_FILE: path.join(base, 'data', 'permissions.json'),
      HEARTH_RECYCLE_BIN_DIRECTORY: path.join(base, 'data', 'trash'),
      HEARTH_ARCHIVE_MEMBER_CACHE_DIR: path.join(base, 'temp', 'members'),
      HEARTH_USER_RULES: 'reader:pw:r',
      HEARTH_RATE_LIMIT_LOGIN_MAX: '0',
      HEARTH_LOG_TO_FILE: 'false',
    });
    app = await buildApp({ config: loadConfig(false), logger: pino({ level: 'silent' }) });
    const login = await app.inject({
      method: 'POST',
      url: '/hearth-api/auth/login',
      payload: { username: 'reader', password: 'pw' },
    });
    cookie = login.headers['set-cookie'] as string;
  });

  afterAll(async () => {
    await app.close();
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    fs.rmSync(base, { recursive: true, force: true });
  });

  const get = (url: string) => app.inject({ url: `/hearth-api${url}`, headers: { cookie } });

  it('is refused by a route that would act on the archive instead', async () => {
    for (const url of ['/files?path=&member=a.txt', '/ledger/progress?member=a.txt']) {
      const response = await get(url);
      expect(response.statusCode, url).toBe(400);
      expect(response.json<{ message: string }>().message).toMatch(/inside an archive/);
    }
  });

  it('is taken by a route that opens files, as a file inside the archive', async () => {
    // Not an archive at all: the route looked inside it rather than serving notes.txt.
    const response = await get('/media/raw?path=notes.txt&member=a.txt');
    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string }>().message).toMatch(/not an archive/);
    expect((await get('/media/raw?path=notes.txt')).body).toBe('not an archive');
  });
});
