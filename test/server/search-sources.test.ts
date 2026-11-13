import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AppConfig, EverythingSource } from '../../server/src/config/index.js';
import type { RuntimeState } from '../../server/src/config/runtime-state.js';
import { Vault } from '../../server/src/lib/vault.js';
import { Beacon } from '../../server/src/modules/beacon/beacon.js';

let rootDirectory: string;

const local: EverythingSource = {
  name: 'local',
  url: 'http://127.0.0.1:8081',
  username: undefined,
  password: undefined,
  maps: null,
};

/** Each Everything answers by host with how many entries it has under the asked folder. */
function indexed(counts: Record<string, number>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const total = counts[new URL(url).host] ?? 0;
      return new Response(JSON.stringify({ totalResults: total, results: [] }));
    }),
  );
}

function beacon(sources: EverythingSource[]): Beacon {
  const runtime = {
    activeRoot: { id: 'test', absolutePath: rootDirectory, label: 'root' },
    onChange: () => () => {},
    get: (key: string) => ({ everythingTimeoutMs: 1000, searchMaxResults: 1000 })[key],
  } as unknown as RuntimeState;
  const config = {
    search: { provider: 'auto', everythingSources: sources, probeCooldownMs: 0 },
  } as unknown as AppConfig;
  return new Beacon(config, runtime, new Vault(runtime), pino({ level: 'silent' }));
}

beforeAll(() => {
  rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-sources-'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  fs.rmSync(rootDirectory, { recursive: true, force: true });
});

describe('choosing an Everything for the root', () => {
  it('walks when the reachable Everything has not indexed the root', async () => {
    indexed({ '127.0.0.1:8081': 0 });
    expect(await beacon([local]).providerName()).toBe('walk');

    indexed({ '127.0.0.1:8081': 3 });
    expect(await beacon([local]).providerName()).toBe('everything');
  });

  it('asks the Everything on the machine that holds the root', async () => {
    const nas: EverythingSource = {
      ...local,
      name: 'nas',
      url: 'http://192.168.1.20:8081',
      maps: [{ local: rootDirectory, remote: 'D:\\Media' }],
    };
    indexed({ '127.0.0.1:8081': 0, '192.168.1.20:8081': 5 });

    const search = beacon([local, nas]);
    expect(await search.providerName()).toBe('everything');
    const status = await search.status();
    expect(status.everything.url).toBe(nas.url);
    expect(status.fallbackActive).toBe(false);
  });

  it('says why it walks when that Everything has not indexed the folder', async () => {
    const nas: EverythingSource = {
      ...local,
      name: 'nas',
      url: 'http://192.168.1.20:8081',
      maps: [{ local: rootDirectory, remote: 'D:\\Media' }],
    };
    indexed({ '127.0.0.1:8081': 9, '192.168.1.20:8081': 0 });

    const status = await beacon([local, nas]).status();
    expect(status.provider).toBe('walk');
    expect(status.fallbackActive).toBe(true);
    expect(status.note).toContain('D:\\Media');
  });
});
