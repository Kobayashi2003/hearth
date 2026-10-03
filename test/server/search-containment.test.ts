import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { EverythingProvider } from '../../server/src/modules/beacon/everything.provider.js';
import { Vault } from '../../server/src/lib/vault.js';
import type { AppConfig } from '../../server/src/config/index.js';
import type { RuntimeState } from '../../server/src/config/runtime-state.js';
import type { SearchQuery } from '../../server/src/modules/beacon/provider.js';

let rootDirectory: string;
let outsideDirectory: string;
let provider: EverythingProvider;

const config = {
  search: {
    everythingUrl: 'http://127.0.0.1:8081',
    everythingUsername: undefined,
    everythingPassword: undefined,
  },
} as unknown as AppConfig;

const query: SearchQuery = {
  text: 'secret',
  scope: '',
  recursive: true,
  sort: { field: 'name', direction: 'asc' },
  page: 1,
  limit: 100,
};

/** Make the Everything HTTP server answer with whatever rows a test wants. */
function respondWith(results: unknown[], total = results.length): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ totalResults: total, results }))),
  );
}

beforeAll(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-beacon-'));
  rootDirectory = path.join(base, 'root');
  outsideDirectory = path.join(base, 'outside');
  fs.mkdirSync(rootDirectory);
  fs.mkdirSync(outsideDirectory);
  fs.writeFileSync(path.join(rootDirectory, 'secret-inside.txt'), 'ok');
  fs.writeFileSync(path.join(outsideDirectory, 'secret-outside.txt'), 'leak');

  const runtime = {
    activeRoot: { id: 'test', absolutePath: rootDirectory, label: 'root' },
    onChange: () => () => {},
    get: (key: string) => ({ everythingTimeoutMs: 1000, searchMaxResults: 1000 })[key],
  } as unknown as RuntimeState;

  provider = new EverythingProvider(config, runtime, new Vault(runtime));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  fs.rmSync(path.dirname(rootDirectory), { recursive: true, force: true });
});

describe('post-retrieval containment', () => {
  it('drops results the index reports outside the active root', async () => {
    respondWith([
      { type: 'file', name: 'secret-inside.txt', path: rootDirectory, size: '2' },
      { type: 'file', name: 'secret-outside.txt', path: outsideDirectory, size: '4' },
      { type: 'file', name: 'sam', path: 'C:\\Windows\\System32\\config', size: '9' },
    ]);

    const page = await provider.search(query);

    expect(page.items.map(item => item.name)).toEqual(['secret-inside.txt']);
    expect(page.items.every(item => !item.path.includes('..'))).toBe(true);
  });

  it('drops a sibling directory that merely shares the root name prefix', async () => {
    respondWith([{ type: 'file', name: 'leak.txt', path: `${rootDirectory}-sibling` }]);
    const page = await provider.search(query);
    expect(page.items).toHaveLength(0);
  });

  it('drops results whose path traverses out of the root', async () => {
    respondWith([
      { type: 'file', name: 'leak.txt', path: path.join(rootDirectory, '..', 'outside') },
    ]);
    const page = await provider.search(query);
    expect(page.items).toHaveLength(0);
  });

  it('subtracts dropped rows from the reported total so paging stays consistent', async () => {
    respondWith(
      [
        { type: 'file', name: 'secret-inside.txt', path: rootDirectory },
        { type: 'file', name: 'secret-outside.txt', path: outsideDirectory },
      ],
      2,
    );

    const page = await provider.search(query);
    expect(page.total).toBe(1);
    expect(page.approximate).toBe(true);
  });

  it('hides system entries the index does not know to skip', async () => {
    respondWith([
      { type: 'file', name: 'x.txt', path: path.join(rootDirectory, '$RECYCLE.BIN') },
      { type: 'file', name: 'secret-inside.txt', path: rootDirectory },
    ]);

    const page = await provider.search(query);
    expect(page.items.map(item => item.name)).toEqual(['secret-inside.txt']);
  });

  it('restricts a non-recursive search to direct children', async () => {
    respondWith([
      { type: 'file', name: 'secret-inside.txt', path: rootDirectory },
      { type: 'file', name: 'nested.txt', path: path.join(rootDirectory, 'sub', 'deep') },
    ]);

    const page = await provider.search({ ...query, recursive: false });
    expect(page.items.map(item => item.name)).toEqual(['secret-inside.txt']);
  });
});
