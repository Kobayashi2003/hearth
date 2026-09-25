import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import type { PermissionRule } from '@hearth/shared';

import { PermissionRegistry } from '../../server/src/modules/warden/permissions.js';
import type { AppConfig } from '../../server/src/config/index.js';

const temporaryFiles: string[] = [];

function registryWith(rules: PermissionRule[]): PermissionRegistry {
  const file = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), 'hearth-perm-')),
    'permissions.json',
  );
  fs.writeFileSync(file, JSON.stringify({ rules }));
  temporaryFiles.push(file);
  return new PermissionRegistry({ auth: { permissionsFile: file } } as unknown as AppConfig);
}

afterEach(() => {
  for (const file of temporaryFiles.splice(0)) {
    fs.rmSync(path.dirname(file), { recursive: true, force: true });
  }
});

describe('global permission fallback', () => {
  const registry = () => registryWith([]);

  it('grants an action present in the permission string', () => {
    expect(registry().allows('bob', 'rw', 'photos', 'read')).toBe(true);
    expect(registry().allows('bob', 'rw', 'photos', 'write')).toBe(true);
  });

  it('denies an action absent from the permission string', () => {
    expect(registry().allows('bob', 'r', 'photos', 'write')).toBe(false);
    expect(registry().allows('bob', 'rw', 'photos', 'admin')).toBe(false);
  });

  it('treats write as implying delete, so existing "rw" accounts keep working', () => {
    expect(registry().allows('bob', 'rw', 'photos', 'delete')).toBe(true);
  });
});

describe('path-scoped rules', () => {
  it('applies a subtree rule to descendants', () => {
    const registry = registryWith([
      { username: 'bob', path: '/private/**', permissions: ['read'], effect: 'deny' },
    ]);
    expect(registry.allows('bob', 'rw', 'private/secret.txt', 'read')).toBe(false);
    expect(registry.allows('bob', 'rw', 'public/open.txt', 'read')).toBe(true);
  });

  it('prefers the more specific rule', () => {
    const registry = registryWith([
      { username: '*', path: '/**', permissions: ['read'], effect: 'deny' },
      { username: '*', path: '/shared/**', permissions: ['read'], effect: 'allow' },
    ]);
    expect(registry.allows('bob', 'r', 'shared/file.txt', 'read')).toBe(true);
    expect(registry.allows('bob', 'r', 'other/file.txt', 'read')).toBe(false);
  });

  it('prefers a user-specific rule over a wildcard one at equal specificity', () => {
    const registry = registryWith([
      { username: '*', path: '/team/**', permissions: ['write'], effect: 'allow' },
      { username: 'bob', path: '/team/**', permissions: ['write'], effect: 'deny' },
    ]);
    expect(registry.allows('bob', 'rw', 'team/file.txt', 'write')).toBe(false);
    expect(registry.allows('ann', 'rw', 'team/file.txt', 'write')).toBe(true);
  });

  it('lets deny win over allow at equal specificity and scope', () => {
    const registry = registryWith([
      { username: '*', path: '/x/**', permissions: ['read'], effect: 'allow' },
      { username: '*', path: '/x/**', permissions: ['read'], effect: 'deny' },
    ]);
    expect(registry.allows('bob', 'r', 'x/file.txt', 'read')).toBe(false);
  });

  it('limits a single-level wildcard to direct children', () => {
    const registry = registryWith([
      { username: '*', path: '/**', permissions: ['read'], effect: 'deny' },
      { username: '*', path: '/docs/*', permissions: ['read'], effect: 'allow' },
    ]);
    expect(registry.allows('bob', 'r', 'docs/a.txt', 'read')).toBe(true);
    expect(registry.allows('bob', 'r', 'docs/nested/a.txt', 'read')).toBe(false);
  });

  it('falls back to global permissions when no rule covers the action', () => {
    const registry = registryWith([
      { username: '*', path: '/**', permissions: ['write'], effect: 'deny' },
    ]);
    expect(registry.allows('bob', 'r', 'any/file.txt', 'read')).toBe(true);
  });
});
