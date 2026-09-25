import type { Identity, PermissionAction } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { HearthError } from '../../lib/errors.js';
import { MediaTokenIssuer } from './media-token.js';
import { PermissionRegistry, actionsFromPermissionString } from './permissions.js';
import type { Session, SessionStore } from './session-store.js';
import { UserDirectory } from './user-directory.js';

/** Everything that decides "may this request do this to this path". */
export class Warden {
  readonly users: UserDirectory;
  readonly permissions: PermissionRegistry;
  readonly mediaTokens: MediaTokenIssuer;

  constructor(
    private readonly config: AppConfig,
    private readonly runtime: RuntimeState,
    private readonly sessions: SessionStore,
  ) {
    this.users = new UserDirectory(config);
    this.permissions = new PermissionRegistry(config);
    this.mediaTokens = new MediaTokenIssuer(
      config.auth.mediaTokenSecret,
      config.auth.mediaTokenTtlSeconds,
    );
  }

  get sessionCookieName(): string {
    return this.config.auth.cookieName;
  }

  get sessionStoreKind(): string {
    return this.sessions.kind;
  }

  async login(username: string, password: string): Promise<Session> {
    const user = await this.users.authenticate(username, password);
    if (!user) throw HearthError.unauthorized('Incorrect username or password');

    if (this.runtime.get('adminOnly') && !user.permissions.includes('a')) {
      throw HearthError.forbidden('The server is currently limited to administrators');
    }

    return this.sessions.create(user.username, user.permissions);
  }

  async logout(sessionId: string): Promise<boolean> {
    return this.sessions.delete(sessionId);
  }

  async resolveSession(sessionId: string | undefined): Promise<Session | null> {
    if (!sessionId) return null;
    return this.sessions.get(sessionId);
  }

  async revokeSessions(username: string): Promise<void> {
    await this.sessions.deleteByUser(username);
  }

  identityOf(session: Session): Identity {
    return {
      username: session.username,
      permissions: session.permissions,
      actions: actionsFromPermissionString(session.permissions),
    };
  }

  can(session: Session, action: PermissionAction, relativePath: string): boolean {
    return this.permissions.allows(session.username, session.permissions, relativePath, action);
  }

  assertCan(session: Session, action: PermissionAction, relativePath: string): void {
    if (!this.can(session, action, relativePath)) {
      throw HearthError.forbidden(`You do not have ${action} permission for this path`);
    }
  }

  issueMediaToken(username: string, relativePath: string): { token: string; expiresAt: number } {
    return this.mediaTokens.issue(username, relativePath, this.runtime.get('activeRootId'));
  }

  /** The token's own path must match the requested one. */
  verifyMediaToken(token: string, relativePath: string): { username: string } | null {
    const payload = this.mediaTokens.verify(token, this.runtime.get('activeRootId'));
    if (!payload) return null;
    return payload.path === relativePath ? { username: payload.sub } : null;
  }

  async close(): Promise<void> {
    await this.sessions.close();
  }
}
