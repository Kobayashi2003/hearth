import type { PermissionAction, PermissionRule } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { JsonDocument } from '../../lib/json-store.js';

interface PermissionsFile {
  rules: PermissionRule[];
}

export const ACTION_CHARS: Record<PermissionAction, string> = {
  read: 'r',
  write: 'w',
  delete: 'd',
  admin: 'a',
};

export function actionsFromPermissionString(permissions: string): PermissionAction[] {
  return (Object.keys(ACTION_CHARS) as PermissionAction[]).filter(action =>
    hasGlobalPermission(permissions, action),
  );
}

/** `w` implies `d`, so older "rw" accounts keep working. */
function hasGlobalPermission(permissions: string, action: PermissionAction): boolean {
  if (permissions.includes(ACTION_CHARS[action])) return true;
  return action === 'delete' && permissions.includes('w');
}

function normalizeRulePath(rulePath: string): string {
  const forward = rulePath.replace(/\\/g, '/');
  return forward.startsWith('/') ? forward : `/${forward}`;
}

/** Windows names one file in any case, so a rule must match it in any case too. */
const foldCase =
  process.platform === 'win32' ? (value: string) => value.toLowerCase() : (value: string) => value;

/** Specificity of a match (0 = none): longer prefixes win, exact beats any wildcard. */
function matchScore(rulePath: string, target: string): number {
  const pattern = foldCase(rulePath);
  const normalizedTarget = foldCase(normalizeRulePath(target));

  if (pattern === normalizedTarget) return normalizedTarget.length * 10 + 5;

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    const matches =
      prefix === '' || normalizedTarget === prefix || normalizedTarget.startsWith(`${prefix}/`);
    return matches ? Math.max(1, prefix.length * 10) : 0;
  }

  if (pattern.endsWith('/*')) return childScore(pattern.slice(0, -2), normalizedTarget);

  return normalizedTarget === pattern || normalizedTarget.startsWith(`${pattern}/`)
    ? pattern.length * 10
    : 0;
}

/** `prefix/*`: the children of `prefix`, not what is inside them. */
function childScore(prefix: string, target: string): number {
  if (!target.startsWith(`${prefix}/`)) return 0;
  const remainder = target.slice(prefix.length + 1);
  return remainder.includes('/') ? 0 : prefix.length * 10 + 1;
}

/**
 * Path-scoped ACL: ranked by specificity, then user over `*`, then deny over
 * allow. With no matching rule the user's global permission string applies.
 */
export class PermissionRegistry {
  private readonly document: JsonDocument<PermissionsFile>;

  constructor(config: AppConfig) {
    this.document = new JsonDocument<PermissionsFile>(config.auth.permissionsFile, () => ({
      rules: [],
    }));
  }

  list(): PermissionRule[] {
    return this.document.read().rules.map(rule => ({
      ...rule,
      effect: rule.effect ?? 'allow',
      path: normalizeRulePath(rule.path),
    }));
  }

  async replaceAll(rules: PermissionRule[]): Promise<PermissionRule[]> {
    const normalized = rules.map(rule => ({
      ...rule,
      effect: rule.effect ?? 'allow',
      path: normalizeRulePath(rule.path),
    }));
    await this.document.update(() => ({ rules: normalized }));
    return normalized;
  }

  allows(
    username: string,
    globalPermissions: string,
    targetPath: string,
    action: PermissionAction,
  ): boolean {
    const rules = this.list();
    if (rules.length === 0) return hasGlobalPermission(globalPermissions, action);

    const candidates = rules
      .filter(rule => rule.username === '*' || rule.username === username)
      .filter(rule => rule.permissions.includes(action))
      .map(rule => ({ rule, score: matchScore(rule.path, targetPath) }))
      .filter(candidate => candidate.score > 0);

    if (candidates.length === 0) return hasGlobalPermission(globalPermissions, action);

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const userSpecific = Number(b.rule.username !== '*') - Number(a.rule.username !== '*');
      if (userSpecific !== 0) return userSpecific;
      return Number(b.rule.effect === 'deny') - Number(a.rule.effect === 'deny');
    });

    return candidates[0]!.rule.effect !== 'deny';
  }

  /**
   * `allows` for `targetPath` and everything inside it: what copying, moving,
   * deleting or zipping a folder does to each item in it. Inside a folder the
   * answer only changes where a rule says so, so only those places are asked
   * about, not every file. `exists` leaves out rules for paths that are not
   * there.
   */
  allowsTree(
    username: string,
    globalPermissions: string,
    targetPath: string,
    action: PermissionAction,
    exists: (relativePath: string) => boolean,
  ): boolean {
    if (!this.allows(username, globalPermissions, targetPath, action)) return false;
    const top = foldCase(normalizeRulePath(targetPath));
    const inside = top === '/' ? '/' : `${top}/`;
    return this.list()
      .filter(rule => rule.username === '*' || rule.username === username)
      .filter(rule => rule.permissions.includes(action))
      .map(rule => probeOf(rule.path))
      .filter(probe => foldCase(probe.at).startsWith(inside) || foldCase(probe.within) === top)
      .every(
        probe =>
          !exists(probe.within.slice(1)) ||
          this.allows(username, globalPermissions, probe.at, action),
      );
  }
}

/** Something inside a folder no listing ever shows, to stand for "any child" of it. */
const ANY_CHILD = '\0any';

/**
 * Where a rule takes effect (`at`), and the folder that must exist for it to
 * (`within`). `a/b/*` applies to any child of `a/b`; `a/b/**` and `a/b` to `a/b`.
 */
function probeOf(rulePath: string): { at: string; within: string } {
  if (rulePath.endsWith('/*')) {
    const within = rulePath.slice(0, -2) || '/';
    return { at: `${within === '/' ? '' : within}/${ANY_CHILD}`, within };
  }
  const at = rulePath.endsWith('/**') ? rulePath.slice(0, -3) || '/' : rulePath;
  return { at, within: at };
}
