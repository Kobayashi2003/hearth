import { ConfigError } from './env.js';

export interface StaticUser {
  username: string;
  /** Plain text or a bcrypt hash. */
  password: string;
  permissions: string;
}

/**
 * `USER_RULES`: "user:pass:perms" joined by ';' (or ','). The password is
 * everything between the first and last ':'.
 */
export function parseStaticUsers(raw: string): StaticUser[] {
  if (!raw.trim()) return [];
  const delimiter = raw.includes(';') ? ';' : ',';
  const users: StaticUser[] = [];

  for (const entry of raw.split(delimiter)) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(':');
    if (parts.length < 3) {
      throw new ConfigError('USER_RULES', `entry "${trimmed}" is not "user:pass:perms"`);
    }
    users.push({
      username: parts[0]!.trim(),
      password: parts.slice(1, -1).join(':'),
      permissions: parts[parts.length - 1]!.trim(),
    });
  }
  return users;
}
