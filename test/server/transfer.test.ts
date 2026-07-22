import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveCollision } from '../../server/src/modules/vault/fileops.service.js';
import { splitRelativeName } from '../../server/src/modules/vault/upload.service.js';
import { uploadRelativeName } from '../../server/src/modules/vault/transfer.routes.js';
import { suggestArchiveName } from '../../server/src/modules/vault/download.service.js';
import { contentDisposition } from '../../server/src/modules/kiln/stream.service.js';
import { HearthError } from '../../server/src/lib/errors.js';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-transfer-'));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('resolveCollision', () => {
  it('returns the plain path when nothing is in the way', async () => {
    const directory = temporaryDirectory();
    expect(await resolveCollision(directory, 'a.txt')).toBe(path.join(directory, 'a.txt'));
  });

  it('suffixes before the extension, Windows-style', async () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, 'a.txt'), '');
    expect(await resolveCollision(directory, 'a.txt')).toBe(path.join(directory, 'a (2).txt'));

    fs.writeFileSync(path.join(directory, 'a (2).txt'), '');
    expect(await resolveCollision(directory, 'a.txt')).toBe(path.join(directory, 'a (3).txt'));
  });

  it('handles a name with no extension', async () => {
    const directory = temporaryDirectory();
    fs.mkdirSync(path.join(directory, 'folder'));
    expect(await resolveCollision(directory, 'folder')).toBe(path.join(directory, 'folder (2)'));
  });

  it('never overwrites, so no caller can lose data by accident', async () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, 'a.txt'), 'original');
    const resolved = await resolveCollision(directory, 'a.txt');
    expect(fs.existsSync(resolved)).toBe(false);
    expect(fs.readFileSync(path.join(directory, 'a.txt'), 'utf8')).toBe('original');
  });
});

describe('splitRelativeName', () => {
  it('splits a nested upload path', () => {
    expect(splitRelativeName('album/2024/photo.jpg')).toEqual(['album', '2024', 'photo.jpg']);
  });

  it('normalises backslashes and drops empty segments', () => {
    expect(splitRelativeName('album\\\\2024\\photo.jpg')).toEqual(['album', '2024', 'photo.jpg']);
    expect(splitRelativeName('./a//b.txt')).toEqual(['a', 'b.txt']);
  });

  it.each(['../escape.txt', 'a/../../b.txt', 'a/CON/b.txt', ''])('rejects %s', candidate => {
    expect(() => splitRelativeName(candidate)).toThrow(HearthError);
  });
});

describe('uploadRelativeName', () => {
  it('takes the path from the field name', () => {
    expect(uploadRelativeName('album/2024/photo.jpg', 'photo.jpg')).toBe('album/2024/photo.jpg');
  });

  it.each(['file', 'files'])('defers to the filename for the reserved field %s', field => {
    expect(uploadRelativeName(field, 'photo.jpg')).toBe('photo.jpg');
  });

  it('rejects a part with neither', () => {
    expect(() => uploadRelativeName('files', undefined)).toThrow(HearthError);
  });
});

describe('suggestArchiveName', () => {
  it('uses the single selected item name', () => {
    expect(suggestArchiveName(['photos/2024'], undefined)).toBe('2024');
  });

  it('falls back to a generic name for a multi-selection', () => {
    expect(suggestArchiveName(['a.txt', 'b.txt'], undefined)).toBe('hearth-selection');
  });

  it('strips a redundant .zip from a requested name', () => {
    expect(suggestArchiveName([], 'bundle.zip')).toBe('bundle');
  });
});

describe('contentDisposition', () => {
  it('carries a UTF-8 filename with an ASCII fallback', () => {
    const header = contentDisposition('中文 报告.pdf');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toMatch(/filename="[\x20-\x7e]*"/);
  });

  it('neutralises quotes that would break the header', () => {
    expect(contentDisposition('a"b.txt')).not.toMatch(/filename="a"b/);
  });
});
