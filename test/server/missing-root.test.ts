import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../server/src/config/index.js';
import { RuntimeState } from '../../server/src/config/runtime-state.js';
import { Vault } from '../../server/src/lib/vault.js';

let directory: string;
const saved = { ...process.env };

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-roots-'));
  fs.mkdirSync(path.join(directory, 'present'));
});

afterEach(() => {
  process.env = { ...saved };
  fs.rmSync(directory, { recursive: true, force: true });
});

function start(roots: string[]) {
  for (const key of Object.keys(process.env))
    if (key.startsWith('HEARTH_')) delete process.env[key];
  Object.assign(process.env, {
    HEARTH_ROOT_DIRECTORIES: roots.map(name => path.join(directory, name)).join(','),
    HEARTH_DATA_DIRECTORY: path.join(directory, 'data'),
  });
  const config = loadConfig(false);
  const runtime = new RuntimeState(config);
  return { config, runtime, vault: new Vault(runtime) };
}

describe('a root that is not there', () => {
  it('does not stop Hearth starting; it serves the first root that is there', () => {
    const { config, runtime } = start(['unplugged', 'present']);
    expect(config.storage.roots).toHaveLength(2);
    expect(runtime.activeRoot.label).toBe('present');
  });

  it('says the drive is missing rather than that every file is', () => {
    const { vault } = start(['unplugged']);
    expect(() => vault.resolve('a.txt')).toThrow(
      expect.objectContaining({ code: 'ROOT_UNAVAILABLE', statusCode: 503 }),
    );
  });

  it('is served once it appears, without a restart', () => {
    const { vault } = start(['later']);
    expect(() => vault.resolve('')).toThrow();
    fs.mkdirSync(path.join(directory, 'later'));
    expect(vault.resolve('a.txt')).toBe(path.join(directory, 'later', 'a.txt'));
  });
});
