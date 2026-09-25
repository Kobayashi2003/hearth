import crypto from 'node:crypto';

export interface Session {
  id: string;
  username: string;
  permissions: string;
  createdAt: number;
  /** Null when sessions never expire. */
  expiresAt: number | null;
}

export interface SessionStore {
  readonly kind: 'memory' | 'redis';
  create(username: string, permissions: string): Promise<Session>;
  get(id: string): Promise<Session | null>;
  delete(id: string): Promise<boolean>;
  /** Used when an account changes or is removed. */
  deleteByUser(username: string): Promise<void>;
  close(): Promise<void>;
}

function isExpired(session: Session, now: number): boolean {
  return session.expiresAt !== null && session.expiresAt <= now;
}

function newSession(username: string, permissions: string, expiryMs: number): Session {
  const now = Date.now();
  return {
    id: crypto.randomBytes(32).toString('base64url'),
    username,
    permissions,
    createdAt: now,
    expiresAt: Number.isFinite(expiryMs) ? now + expiryMs : null,
  };
}

export class MemorySessionStore implements SessionStore {
  readonly kind = 'memory' as const;
  private readonly sessions = new Map<string, Session>();
  private readonly sweeper: NodeJS.Timeout;

  constructor(private readonly expiryMs: number) {
    this.sweeper = setInterval(() => this.sweepExpired(), 60_000);
    this.sweeper.unref();
  }

  private sweepExpired(): void {
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (isExpired(session, now)) this.sessions.delete(id);
    }
  }

  async create(username: string, permissions: string): Promise<Session> {
    const session = newSession(username, permissions, this.expiryMs);
    this.sessions.set(session.id, session);
    return session;
  }

  async get(id: string): Promise<Session | null> {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (isExpired(session, Date.now())) {
      this.sessions.delete(id);
      return null;
    }
    return session;
  }

  async delete(id: string): Promise<boolean> {
    return this.sessions.delete(id);
  }

  async deleteByUser(username: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.username === username) this.sessions.delete(id);
    }
  }

  async close(): Promise<void> {
    clearInterval(this.sweeper);
    this.sessions.clear();
  }
}

/** The slice of the optional `redis` client this store uses. */
interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { PX: number }): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  sAdd(key: string, member: string): Promise<number>;
  sMembers(key: string): Promise<string[]>;
  sRem(key: string, member: string | string[]): Promise<number>;
  quit(): Promise<unknown>;
}

const SESSION_PREFIX = 'hearth:session:';
const USER_SESSIONS_PREFIX = 'hearth:user-sessions:';

/** Survives restarts; a per-user set allows revoking without scanning keys. */
export class RedisSessionStore implements SessionStore {
  readonly kind = 'redis' as const;

  constructor(
    private readonly client: RedisLike,
    private readonly expiryMs: number,
  ) {}

  async create(username: string, permissions: string): Promise<Session> {
    const session = newSession(username, permissions, this.expiryMs);
    await this.client.set(
      SESSION_PREFIX + session.id,
      JSON.stringify(session),
      Number.isFinite(this.expiryMs) ? { PX: this.expiryMs } : undefined,
    );
    await this.client.sAdd(USER_SESSIONS_PREFIX + username, session.id);
    return session;
  }

  async get(id: string): Promise<Session | null> {
    const raw = await this.client.get(SESSION_PREFIX + id);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (isExpired(session, Date.now())) {
      await this.delete(id);
      return null;
    }
    return session;
  }

  async delete(id: string): Promise<boolean> {
    const raw = await this.client.get(SESSION_PREFIX + id);
    if (raw) {
      const session = JSON.parse(raw) as Session;
      await this.client.sRem(USER_SESSIONS_PREFIX + session.username, id);
    }
    return (await this.client.del(SESSION_PREFIX + id)) > 0;
  }

  async deleteByUser(username: string): Promise<void> {
    const ids = await this.client.sMembers(USER_SESSIONS_PREFIX + username);
    if (ids.length > 0) await this.client.del(ids.map(id => SESSION_PREFIX + id));
    await this.client.del(USER_SESSIONS_PREFIX + username);
  }

  async close(): Promise<void> {
    await this.client.quit();
  }
}

/** Redis is optional: an unreachable one falls back to memory with a warning. */
export async function createSessionStore(
  redisUrl: string | undefined,
  expiryMs: number,
  onFallback: (reason: string) => void,
): Promise<SessionStore> {
  if (!redisUrl) return new MemorySessionStore(expiryMs);

  try {
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    await client.connect();
    return new RedisSessionStore(client as unknown as RedisLike, expiryMs);
  } catch (error) {
    onFallback(error instanceof Error ? error.message : String(error));
    return new MemorySessionStore(expiryMs);
  }
}
