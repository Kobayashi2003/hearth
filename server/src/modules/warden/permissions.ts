import type { PermissionAction, PermissionRule } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import { JsonDocument } from '../../lib/json-store.js';

interface PermissionsFile {
  rules: PermissionRule[];
}

const ACTION_CHARS: Record<PermissionAction, string> = {
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

/** Specificity of a match (0 = none): longer prefixes win, exact beats any wildcard. */
function matchScore(pattern: string, target: string): number {
  const normalizedTarget = normalizeRulePath(target);

  if (pattern === normalizedTarget) return normalizedTarget.length * 10 + 5;

  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3);
    const matches =
      prefix === '' || normalizedTarget === prefix || normalizedTarget.startsWith(`${prefix}/`);
    return matches ? Math.max(1, prefix.length * 10) : 0;
  }

  if (pattern.endsWith('/*')) {
    const prefix = pattern.slice(0, -2);
    if (!normalizedTarget.startsWith(`${prefix}/`)) return 0;
    const remainder = normalizedTarget.slice(prefix.length + 1);
    return remainder.includes('/') ? 0 : prefix.length * 10 + 1;
  }

  return normalizedTarget === pattern || normalizedTarget.startsWith(`${pattern}/`)
    ? pattern.length * 10
    : 0;
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
}
