import crypto from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { ManagedUser } from '@hearth/shared';

import type { AppConfig, StaticUser } from '../../config/index.js';
import { JsonDocument } from '../../lib/json-store.js';
import { HearthError } from '../../lib/errors.js';

interface StoredUser {
  username: string;
  passwordHash: string;
  permissions: string;
  createdAt: string;
}

interface UsersFile {
  users: StoredUser[];
}

const BCRYPT_PATTERN = /^\$2[aby]\$\d{2}\$/;
const BCRYPT_ROUNDS = 10;

/** Compared against for unknown users, so login timing cannot enumerate accounts. */
const DUMMY_HASH = '$2b$10$iyzqHYMMZz1FJyXbaNhiD.1wz5fcbNK4M57Ix2RDchn65Jt49zcaG';

export interface AuthenticatedUser {
  username: string;
  permissions: string;
}

/** Users from `USER_RULES` (read-only) plus users managed in the admin UI (users.json). */
export class UserDirectory {
  private readonly document: JsonDocument<UsersFile>;
  private readonly staticUsers: readonly StaticUser[];

  constructor(config: AppConfig) {
    this.staticUsers = config.auth.staticUsers;
    this.document = new JsonDocument<UsersFile>(config.auth.usersFile, () => ({ users: [] }));
  }

  list(): ManagedUser[] {
    const fromEnv = this.staticUsers.map(user => ({
      username: user.username,
      permissions: user.permissions,
    }));
    const fromFile = this.document.read().users.map(user => ({
      username: user.username,
      permissions: user.permissions,
      createdAt: user.createdAt,
    }));
    return [...fromEnv, ...fromFile];
  }

  isManaged(username: string): boolean {
    return this.document.read().users.some(user => user.username === username);
  }

  /** Null for both unknown user and wrong password, in comparable time. */
  async authenticate(username: string, password: string): Promise<AuthenticatedUser | null> {
    const envUser = this.staticUsers.find(user => user.username === username);
    if (envUser) {
      const matched = await verifyPassword(password, envUser.password);
      return matched ? { username: envUser.username, permissions: envUser.permissions } : null;
    }

    const fileUser = this.document.read().users.find(user => user.username === username);
    if (fileUser) {
      const matched = await bcrypt.compare(password, fileUser.passwordHash);
      return matched ? { username: fileUser.username, permissions: fileUser.permissions } : null;
    }

    await bcrypt.compare(password, DUMMY_HASH).catch(() => undefined);
    return null;
  }

  async create(username: string, password: string, permissions: string): Promise<ManagedUser> {
    assertUsername(username);
    if (this.list().some(user => user.username === username)) {
      throw HearthError.conflict(`User "${username}" already exists`);
    }
    const record: StoredUser = {
      username,
      passwordHash: await bcrypt.hash(password, BCRYPT_ROUNDS),
      permissions,
      createdAt: new Date().toISOString(),
    };
    await this.document.update(current => ({ users: [...current.users, record] }));
    return { username, permissions, createdAt: record.createdAt };
  }

  async update(
    username: string,
    changes: { password?: string; permissions?: string },
  ): Promise<ManagedUser> {
    const existing = this.document.read().users.find(user => user.username === username);
    if (!existing) throw this.notEditable(username);

    const passwordHash = changes.password
      ? await bcrypt.hash(changes.password, BCRYPT_ROUNDS)
      : existing.passwordHash;
    const permissions = changes.permissions ?? existing.permissions;

    await this.document.update(current => ({
      users: current.users.map(user =>
        user.username === username ? { ...user, passwordHash, permissions } : user,
      ),
    }));
    return { username, permissions, createdAt: existing.createdAt };
  }

  async remove(username: string): Promise<void> {
    if (!this.isManaged(username)) throw this.notEditable(username);
    await this.document.update(current => ({
      users: current.users.filter(user => user.username !== username),
    }));
  }

  private notEditable(username: string): HearthError {
    return this.staticUsers.some(user => user.username === username)
      ? HearthError.forbidden(
          `"${username}" is defined in the environment and cannot be changed here`,
        )
      : HearthError.notFound(`No such user: "${username}"`);
  }
}

/** Env passwords may be bcrypt or plain text; both compare in constant time. */
async function verifyPassword(candidate: string, stored: string): Promise<boolean> {
  if (BCRYPT_PATTERN.test(stored)) return bcrypt.compare(candidate, stored);

  const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
  const matched = crypto.timingSafeEqual(digest(candidate), digest(stored));
  await bcrypt.compare(candidate, DUMMY_HASH).catch(() => undefined);
  return matched;
}

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

function assertUsername(username: string): void {
  if (!USERNAME_PATTERN.test(username)) {
    throw HearthError.badRequest(
      'Username may only contain letters, digits, dot, underscore and hyphen',
    );
  }
}
