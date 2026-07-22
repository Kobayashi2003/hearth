import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { HearthError } from '../../server/src/lib/errors.js';
import { Vault, assertValidEntryName } from '../../server/src/lib/vault.js';
import type { RuntimeState } from '../../server/src/config/runtime-state.js';

let rootDirectory: string;
let vault: Vault;

/** A RuntimeState stub — Vault only reads the active root from it. */
function runtimeWithRoot(absolutePath: string): RuntimeState {
  return {
    activeRoot: { id: 'test', absolutePath, label: path.basename(absolutePath) },
  } as unknown as RuntimeState;
}

beforeAll(() => {
  rootDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-vault-'));
  fs.mkdirSync(path.join(rootDirectory, 'inside'), { recursive: true });
  fs.writeFileSync(path.join(rootDirectory, 'inside', 'file.txt'), 'content');
  vault = new Vault(runtimeWithRoot(rootDirectory));
});

afterAll(() => {
  fs.rmSync(rootDirectory, { recursive: true, force: true });
});

describe('Vault.resolve', () => {
  it('resolves the root for an empty path', () => {
    expect(vault.resolve('')).toBe(rootDirectory);
    expect(vault.resolve(undefined)).toBe(rootDirectory);
  });

  it('resolves paths inside the root', () => {
    expect(vault.resolve('inside/file.txt')).toBe(path.join(rootDirectory, 'inside', 'file.txt'));
  });

  it.each([
    '..',
    '../outside',
    'inside/../../outside',
    '../../../Windows/System32',
    'inside/./../../escape',
  ])('rejects traversal via %s', candidate => {
    expect(() => vault.resolve(candidate)).toThrow(HearthError);
  });

  it('rejects paths containing a null byte', () => {
    expect(() => vault.resolve('inside/\0file')).toThrow(HearthError);
  });

  it('allows a not-yet-existing path inside the root', () => {
    expect(vault.resolve('inside/new-file.txt')).toBe(
      path.join(rootDirectory, 'inside', 'new-file.txt'),
    );
  });
});

describe('Vault.adopt', () => {
  it('accepts an absolute path inside the root', () => {
    const candidate = path.join(rootDirectory, 'inside', 'file.txt');
    expect(vault.adopt(candidate)).toBe(candidate);
  });

  it('rejects an absolute path outside the root', () => {
    expect(vault.adopt(path.join(os.tmpdir(), 'elsewhere.txt'))).toBeNull();
  });

  it('rejects a sibling directory sharing the root prefix', () => {
    expect(vault.adopt(`${rootDirectory}-sibling/file.txt`)).toBeNull();
  });
});

describe('Vault.relativize', () => {
  it('produces forward-slash root-relative paths', () => {
    const target = path.join(rootDirectory, 'inside', 'file.txt');
    expect(vault.relativize(target)).toBe('inside/file.txt');
  });
});

describe('assertValidEntryName', () => {
  it.each(['photo.jpg', 'a-b_c (1).mp4', '中文 文件.txt', '.gitignore'])('accepts %s', name => {
    expect(() => assertValidEntryName(name)).not.toThrow();
  });

  it.each(['', ' padded', '..', 'a/b', 'a\\b', 'a:b', 'a?b', 'CON', 'nul.txt', 'trailing.'])(
    'rejects %s',
    name => {
      expect(() => assertValidEntryName(name)).toThrow(HearthError);
    },
  );
});
