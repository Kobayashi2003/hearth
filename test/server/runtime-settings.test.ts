import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../server/src/config/index.js';
import { RuntimeState } from '../../server/src/config/runtime-state.js';

let directory: string;
const saved = { ...process.env };

function load(env: Record<string, string> = {}) {
  for (const key of Object.keys(process.env))
    if (key.startsWith('HEARTH_')) delete process.env[key];
  Object.assign(process.env, {
    HEARTH_ROOT_DIRECTORIES: './example',
    HEARTH_DATA_DIRECTORY: directory,
    ...env,
  });
  return new RuntimeState(loadConfig(false));
}

const stateFile = () => path.join(directory, 'runtime.json');
/** Writes are atomic but asynchronous; give them a moment to land. */
const settle = () => new Promise(resolve => setTimeout(resolve, 50));

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-runtime-'));
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('runtime settings', () => {
  it('start from .env and let an administrator override and reset them', () => {
    const runtime = load({ HEARTH_ARCHIVE_MAX_ENTRIES: '300' });
    expect(runtime.get('archiveMaxEntries')).toBe(300);

    expect(runtime.set('archiveMaxEntries', 0)).toBeNull();
    expect(runtime.get('archiveMaxEntries')).toBe(Number.POSITIVE_INFINITY);
    const described = runtime.describe().find(setting => setting.key === 'archiveMaxEntries');
    expect(described).toMatchObject({
      value: 0,
      default: 300,
      overridden: true,
      kind: 'limit',
      variable: 'HEARTH_ARCHIVE_MAX_ENTRIES',
    });

    runtime.set('archiveMaxEntries', null);
    expect(runtime.get('archiveMaxEntries')).toBe(300);
  });

  it('save only overrides, so a later .env change still reaches settings left alone', async () => {
    const first = load();
    first.set('htmlScripts', true);
    await settle();
    expect(JSON.parse(fs.readFileSync(stateFile(), 'utf8')).overrides).toEqual({
      htmlScripts: true,
    });

    const next = load({ HEARTH_HTML_RUFFLE: 'true', HEARTH_HTML_SCRIPTS: 'false' });
    expect(next.get('htmlRuffle')).toBe(true);
    expect(next.get('htmlScripts')).toBe(true);
  });

  it('read the old flat file, keeping only real differences from the defaults', () => {
    fs.writeFileSync(
      stateFile(),
      JSON.stringify({
        adminOnly: false,
        trashEnabled: true,
        htmlViewerEnabled: true,
        htmlExternalResourcesEnabled: true,
      }),
    );
    const runtime = load();
    expect(runtime.get('htmlExternalResources')).toBe(true);
    const overridden = runtime.describe().filter(setting => setting.overridden);
    expect(overridden.map(setting => setting.key)).toEqual(['htmlExternalResources']);
  });

  it('refuse values of the wrong kind, and never an unlimited safeguard', () => {
    const runtime = load();
    expect(runtime.set('htmlScripts', 1)).toMatch(/true or false/);
    expect(runtime.set('archiveMaxEntries', -1)).toMatch(/0 \(unlimited\) or more/);
    expect(runtime.set('folderCoverMaxDepth', 0)).toMatch(/at least 1/);
    expect(runtime.set('everythingTimeoutMs', 2.5)).toMatch(/whole number/);
    expect(runtime.get('folderCoverMaxDepth')).toBe(2);
  });
});
