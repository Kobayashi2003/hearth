import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';

import AdmZip from 'adm-zip';
import pino from 'pino';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp, type HearthApp } from '../../server/src/app.js';
import { loadConfig } from '../../server/src/config/index.js';
import { RuntimeState } from '../../server/src/config/runtime-state.js';
import type { SafePath } from '../../server/src/lib/vault.js';
import { Beacon } from '../../server/src/modules/beacon/beacon.js';
import type { SearchQuery } from '../../server/src/modules/beacon/provider.js';
import { UploadService } from '../../server/src/modules/vault/upload.service.js';

/**
 * Regressions for the problems reported on GitHub (#1–#26), through the real
 * app where they were found there: two roots, an administrator and a reader.
 */
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-issues-'));
const rootA = path.join(base, 'rootA');
const rootB = path.join(base, 'rootB');
const outside = path.join(base, 'outside');
const saved = { ...process.env };
let app: HearthApp;
const cookies: Record<string, string> = {};

const env = () => ({
  HEARTH_ROOT_DIRECTORIES: `${rootA},${rootB}`,
  HEARTH_DATA_DIRECTORY: path.join(base, 'data'),
  HEARTH_TEMP_DIRECTORY: path.join(base, 'temp'),
  HEARTH_USERS_FILE: path.join(base, 'data', 'users.json'),
  HEARTH_PERMISSIONS_FILE: path.join(base, 'data', 'permissions.json'),
  HEARTH_RECYCLE_BIN_DIRECTORY: path.join(base, 'data', 'trash'),
  HEARTH_UPLOAD_CHUNK_DIRECTORY: path.join(base, 'temp', 'chunks'),
  HEARTH_USER_RULES: 'boss:pw:rwa;reader:pw:rw',
  HEARTH_RATE_LIMIT_LOGIN_MAX: '0',
  HEARTH_RATE_LIMIT_WRITE_MAX: '0',
  HEARTH_LOG_TO_FILE: 'false',
});

beforeAll(async () => {
  for (const folder of [rootA, rootB, outside]) fs.mkdirSync(folder, { recursive: true });
  for (const key of Object.keys(process.env))
    if (key.startsWith('HEARTH_')) delete process.env[key];
  Object.assign(process.env, env());
  app = await buildApp({ config: loadConfig(false), logger: pino({ level: 'silent' }) });
  for (const user of ['boss', 'reader']) cookies[user] = await signIn(user, 'pw');
});

afterAll(async () => {
  await app.close();
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  fs.rmSync(base, { recursive: true, force: true });
});

async function signIn(username: string, password: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/hearth-api/auth/login',
    payload: { username, password },
  });
  return response.headers['set-cookie'] as string;
}

type As = 'boss' | 'reader';
const call = (as: As, method: string, url: string, payload?: unknown) =>
  app.inject({
    method: method as 'GET',
    url: `/hearth-api${url}`,
    headers: { cookie: cookies[as]! },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });

/** One multipart file part whose field name carries the path, as a folder upload sends it. */
function multipart(field: string, filename: string, content: string) {
  const boundary = 'hearth-test-boundary';
  const body =
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
    `Content-Type: application/octet-stream\r\n\r\n${content}\r\n--${boundary}--\r\n`;
  return { body, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } };
}

const upload = (as: As, folder: string, field: string, content: string) => {
  const { body, headers } = multipart(field, path.basename(field), content);
  return app.inject({
    method: 'POST',
    url: `/hearth-api/upload?path=${encodeURIComponent(folder)}`,
    headers: { ...headers, cookie: cookies[as]! },
    payload: body,
  });
};

const deny = (rules: Array<{ path: string; permissions: string[] }>) =>
  call('boss', 'PUT', '/admin/permissions', {
    rules: rules.map(rule => ({ username: 'reader', effect: 'deny', ...rule })),
  });

const rootIds = async () =>
  (await call('boss', 'GET', '/system/roots')).json<{
    roots: Array<{ id: string; absolutePath?: string; path?: string; active: boolean }>;
  }>().roots;

async function serve(root: 'A' | 'B') {
  const roots = await rootIds();
  const wanted = root === 'A' ? roots[0]! : roots[1]!;
  const response = await call('boss', 'POST', '/system/roots', { id: wanted.id });
  expect(response.statusCode).toBe(200);
}

function write(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

beforeEach(async () => {
  await deny([]);
  await serve('A');
});

describe('#1 a junction inside the root', () => {
  it('cannot take an upload out of the root through a folder not made yet', async () => {
    fs.symlinkSync(outside, path.join(rootA, 'link'), 'junction');
    const response = await upload('boss', '', 'link/new-folder/new.txt', 'escaped');
    expect(response.statusCode).toBe(403);
    expect(fs.existsSync(path.join(outside, 'new-folder'))).toBe(false);
    fs.rmSync(path.join(rootA, 'link'));
  });
});

describe('#2 a deny rule on Windows', () => {
  it.runIf(process.platform === 'win32')('holds however the path is capitalised', async () => {
    write(path.join(rootA, 'bundle', 'secret.txt'), 'CONFIDENTIAL');
    await deny([{ path: '/bundle/secret.txt', permissions: ['read'] }]);
    for (const spelling of ['bundle/secret.txt', 'BUNDLE/SECRET.TXT', 'bundle/secret.txt.']) {
      const response = await call(
        'reader',
        'GET',
        `/download?path=${encodeURIComponent(spelling)}`,
      );
      // Refused, or (a trailing dot Node keeps) not found: never the file.
      expect(response.statusCode, spelling).not.toBe(200);
    }
  });
});

describe('#3 a folder upload', () => {
  it('cannot name its way into a folder its uploader may not write', async () => {
    fs.mkdirSync(path.join(rootA, 'blocked'), { recursive: true });
    await deny([{ path: '/blocked/**', permissions: ['read', 'write', 'delete'] }]);
    const response = await upload('reader', '', 'blocked/new.txt', 'sneaked');
    expect(response.statusCode).toBe(403);
    expect(fs.existsSync(path.join(rootA, 'blocked', 'new.txt'))).toBe(false);
  });
});

describe('#4 #5 a folder holding something its user may not read', () => {
  beforeEach(async () => {
    write(path.join(rootA, 'bundle', 'secret.txt'), 'CONFIDENTIAL');
    write(path.join(rootA, 'bundle', 'open.txt'), 'fine');
    fs.mkdirSync(path.join(rootA, 'dest'), { recursive: true });
    await deny([{ path: '/bundle/secret.txt', permissions: ['read'] }]);
  });

  it('cannot be zipped', async () => {
    const response = await call('reader', 'POST', '/download/zip', { paths: ['bundle'] });
    expect(response.statusCode).toBe(403);
  });

  it('cannot be copied somewhere the rule does not reach', async () => {
    const response = await call('reader', 'POST', '/fs/copy', {
      sources: ['bundle'],
      destination: 'dest',
    });
    expect(response.statusCode).toBe(403);
    expect(fs.existsSync(path.join(rootA, 'dest', 'bundle'))).toBe(false);
  });

  it('is zipped whole for someone who may read all of it', async () => {
    const ticket = await call('boss', 'POST', '/download/zip', { paths: ['bundle'] });
    const zip = await app.inject({ url: `/hearth-api/download/zip/${ticket.json().token}` });
    expect(zip.statusCode).toBe(200);
    const names = new AdmZip(zip.rawPayload).getEntries().map(entry => entry.entryName);
    expect(names).toContain('bundle/secret.txt');
  });
});

describe('#6 the recycle bin', () => {
  it('keeps what was deleted from a denied folder from those it is denied to', async () => {
    write(path.join(rootA, 'private', 'trash.txt'), 'old');
    expect((await call('boss', 'DELETE', '/fs', { paths: ['private/trash.txt'] })).statusCode).toBe(
      200,
    );
    await deny([{ path: '/private/**', permissions: ['read', 'write', 'delete'] }]);

    const listed = (await call('reader', 'GET', '/trash')).json<{ items: Array<{ id: string }> }>();
    expect(listed.items).toEqual([]);
    const all = (await call('boss', 'GET', '/trash')).json<{
      items: Array<{ id: string; originalPath: string }>;
    }>();
    const id = all.items.find(item => item.originalPath === 'private/trash.txt')!.id;

    const restored = await call('reader', 'POST', '/trash/restore', { ids: [id] });
    expect(restored.json<{ results: Array<{ ok: boolean }> }>().results[0]!.ok).toBe(false);
    expect((await call('reader', 'DELETE', `/trash/${id}`)).statusCode).toBe(403);
    await call('reader', 'DELETE', '/trash');
    expect((await call('boss', 'GET', '/trash')).json<{ items: unknown[] }>().items).toHaveLength(
      all.items.length,
    );
  });
});

describe('#13 a deleted folder', () => {
  it('counts what it holds', async () => {
    write(path.join(rootA, 'heavy', 'big.bin'), 'x'.repeat(5000));
    await call('boss', 'DELETE', '/fs', { paths: ['heavy'] });
    const { items } = (await call('boss', 'GET', '/trash')).json<{
      items: Array<{ originalPath: string; size: number }>;
    }>();
    expect(items.find(item => item.originalPath === 'heavy')!.size).toBe(5000);
  });
});

describe('#7 a media token', () => {
  it('stops working with its user', async () => {
    write(path.join(rootA, 'media.txt'), 'MEDIA_SECRET');
    await call('boss', 'POST', '/admin/users', {
      username: 'guest',
      password: 'guest-pw',
      permissions: 'r',
    });
    cookies.guest = await signIn('guest', 'guest-pw');
    const issued = await app.inject({
      method: 'POST',
      url: '/hearth-api/media/token',
      headers: { cookie: cookies.guest },
      payload: { path: 'media.txt' },
    });
    const { token } = issued.json<{ token: string }>();
    const fetchIt = () => app.inject({ url: `/hearth-api/download?path=media.txt&token=${token}` });
    expect((await fetchIt()).statusCode).toBe(200);

    await call('boss', 'DELETE', '/admin/users/guest');
    expect((await fetchIt()).statusCode).toBe(401);
  });
});

describe('#14 the root itself', () => {
  it('cannot be renamed, moved or deleted', async () => {
    expect((await call('boss', 'POST', '/fs/rename', { path: '', name: 'gone' })).statusCode).toBe(
      400,
    );
    const deleted = await call('boss', 'DELETE', '/fs', { paths: [''] });
    expect(deleted.json<{ results: Array<{ ok: boolean }> }>().results[0]!.ok).toBe(false);
    expect(fs.existsSync(rootA)).toBe(true);
    expect((await call('boss', 'GET', '/files?path=')).statusCode).toBe(200);
  });
});

describe('chunked uploads', () => {
  const begin = async (relativePath: string, size: number) =>
    (
      await call('boss', 'POST', '/upload/chunked/init', {
        path: '',
        relativePath,
        size,
        chunkSize: 3,
      })
    ).json<{ uploadId: string }>().uploadId;

  const chunk = (id: string, index: number, content: string) => {
    const { body, headers } = multipart('chunk', 'blob', content);
    return app.inject({
      method: 'POST',
      url: `/hearth-api/upload/chunked/${id}/${index}`,
      headers: { ...headers, cookie: cookies.boss! },
      payload: body,
    });
  };

  it('#11 refuses a chunk of the wrong length, and takes it again when right', async () => {
    const id = await begin('short.txt', 6);
    expect((await chunk(id, 0, 'A')).statusCode).toBe(400);
    expect((await chunk(id, 0, 'AAA')).statusCode).toBe(200);
    expect((await chunk(id, 1, 'BBB')).statusCode).toBe(200);
    const done = await call('boss', 'POST', `/upload/chunked/${id}/complete`);
    expect(done.statusCode).toBe(200);
    expect(fs.readFileSync(path.join(rootA, 'short.txt'), 'utf8')).toBe('AAABBB');
  });

  it('#10 is not finished into another root', async () => {
    const id = await begin('rooted.txt', 6);
    await chunk(id, 0, 'AAA');
    await serve('B');
    await chunk(id, 1, 'BBB');
    expect((await call('boss', 'POST', `/upload/chunked/${id}/complete`)).statusCode).toBe(409);
    expect(fs.existsSync(path.join(rootB, 'rooted.txt'))).toBe(false);
  });
});

describe('#12 reading places', () => {
  it('belong to the root they were made in', async () => {
    const place = { kind: 'page', at: 42, total: 100, percent: 42, savedAt: Date.now() };
    await call('reader', 'PATCH', '/ledger/progress', { progress: { 'book.epub': place } });
    expect((await call('reader', 'GET', '/ledger/progress')).json()).toHaveProperty('book.epub');
    await serve('B');
    expect((await call('reader', 'GET', '/ledger/progress')).json()).not.toHaveProperty(
      'book.epub',
    );
    await serve('A');
    expect((await call('reader', 'GET', '/ledger/progress')).json()).toHaveProperty('book.epub');
  });
});

describe('#8 #9 storing an upload', () => {
  const service = () => {
    const runtime = new RuntimeState(loadConfig(false));
    const vault = app.hearth.vault;
    return new UploadService({ upload: { validateMagicNumber: true } } as never, runtime, vault);
  };
  const folder = () => app.hearth.vault.resolve('') as SafePath;
  const anyone = () => undefined;

  it('#8 keeps every byte past the part checked for its type', async () => {
    const stored = await service().store(
      folder(),
      'validated.txt',
      Readable.from([Buffer.alloc(5000, 65), Buffer.alloc(5000, 66)]),
      anyone,
    );
    expect(stored.size).toBe(10_000);
    expect(fs.statSync(path.join(rootA, 'validated.txt')).size).toBe(10_000);
  });

  it('#9 gives two uploads of one name a file each', async () => {
    const uploads = service();
    const results = await Promise.all(
      ['FIRST', 'SECOND'].map(content =>
        uploads.store(folder(), 'parallel.txt', Readable.from([content]), anyone),
      ),
    );
    expect(new Set(results.map(result => result.path)).size).toBe(2);
    const contents = results.map(result => fs.readFileSync(path.join(rootA, result.path), 'utf8'));
    expect(contents.sort()).toEqual(['FIRST', 'SECOND']);
  });
});

describe('#26 a search over partly denied files', () => {
  it('pages and counts only what the user may read', async () => {
    const beacon = new Beacon(
      app.hearth.config,
      app.hearth.runtime,
      app.hearth.vault,
      pino({ level: 'silent' }),
    );
    const file = (name: string) => ({
      name,
      path: name,
      size: 1,
      mtime: new Date(0).toISOString(),
      mimeType: 'audio/mpeg',
      isDirectory: false,
    });
    // The provider pages as a real one does: the denied file comes first.
    const all = [file('a-denied.mp3'), file('b-visible.mp3')];
    Object.assign(beacon, {
      selectProvider: async () => ({
        name: 'walk',
        search: async (query: SearchQuery) => {
          const size = Number.isFinite(query.limit) ? query.limit : all.length;
          const start = (query.page - 1) * size;
          return {
            items: all.slice(start, start + size),
            total: all.length,
            hasMore: start + size < all.length,
            provider: 'walk',
            approximate: false,
          };
        },
      }),
    });
    const query: SearchQuery = {
      text: '',
      scope: '',
      type: 'audio',
      recursive: true,
      sort: { field: 'name', direction: 'asc' },
      page: 1,
      limit: 1,
    };
    const page = await beacon.search(query, item => item !== 'a-denied.mp3', false);
    expect(page.items.map(item => item.name)).toEqual(['b-visible.mp3']);
    expect(page.total).toBe(1);
  });
});
