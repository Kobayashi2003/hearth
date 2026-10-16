import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HobService } from '../../server/src/modules/hob/hob.service.js';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true });
});

function hob(): HobService {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-hob-'));
  directories.push(directory);
  return new HobService(directory);
}

describe('favorites follow the folders they name', () => {
  it("moves every user's favorites under a renamed folder, in the root it happened in", async () => {
    const service = hob();
    await service.patch('ann', {
      favorites: [
        { root: 'films', path: 'Anime' },
        { root: 'films', path: 'Anime/Season 1', label: 'S1' },
        { root: 'films', path: 'Anime Movies' },
        { root: 'music', path: 'Anime' },
      ],
    });
    await service.patch('bob', { favorites: [{ root: 'films', path: 'Anime/Season 2' }] });

    await service.favoritesFollower(() => 'films').reprefix('Anime', 'Animation');

    expect(service.read('ann').favorites).toEqual([
      { root: 'films', path: 'Animation' },
      { root: 'films', path: 'Animation/Season 1', label: 'S1' },
      // Only a whole path segment matches; another root is a different tree.
      { root: 'films', path: 'Anime Movies' },
      { root: 'music', path: 'Anime' },
    ]);
    expect(service.read('bob').favorites).toEqual([{ root: 'films', path: 'Animation/Season 2' }]);
  });

  it('drops favorites under a folder deleted for good', async () => {
    const service = hob();
    await service.patch('ann', {
      favorites: [
        { root: 'films', path: 'Old/Keep' },
        { root: 'films', path: 'Older' },
      ],
    });
    await service.favoritesFollower(() => 'films').forget('Old');
    expect(service.read('ann').favorites).toEqual([{ root: 'films', path: 'Older' }]);
  });

  it('gives an older document the new preferences with their defaults', () => {
    expect(hob().read('nobody')).toMatchObject({ favorites: [], readerTheme: 'hearth' });
  });
});
