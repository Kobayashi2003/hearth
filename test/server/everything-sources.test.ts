import { afterEach, describe, expect, it } from 'vitest';

import { parseEverythingSources } from '../../server/src/config/everything-sources.js';

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

describe('Everything sources', () => {
  it('reads one remote Everything answering for several folders', () => {
    process.env.HEARTH_EVERYTHING_REMOTE_NAS_URL = 'http://192.168.1.20:8081/';
    process.env.HEARTH_EVERYTHING_REMOTE_NAS_USERNAME = 'hearth';
    process.env.HEARTH_EVERYTHING_REMOTE_NAS_PATHS = 'F:/ | \\\\nas\\saves > I:\\Saves';

    const [local, nas] = parseEverythingSources();

    expect(local?.maps).toBeNull();
    expect(nas).toMatchObject({
      name: 'nas',
      url: 'http://192.168.1.20:8081',
      username: 'hearth',
      maps: [{ remote: 'F:\\' }, { remote: 'I:\\Saves' }],
    });
  });

  it('refuses a remote without the folders it answers for', () => {
    process.env.HEARTH_EVERYTHING_REMOTE_NAS_URL = 'http://192.168.1.20:8081';
    expect(() => parseEverythingSources()).toThrow(/EVERYTHING_REMOTE_NAS_PATHS/);
  });

  it('refuses a remote side that is not a Windows path', () => {
    process.env.HEARTH_EVERYTHING_REMOTE_NAS_URL = 'http://192.168.1.20:8081';
    process.env.HEARTH_EVERYTHING_REMOTE_NAS_PATHS = 'F:\\ > media';
    expect(() => parseEverythingSources()).toThrow(/Windows path/);
  });
});
