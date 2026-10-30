import type { Identity, PermissionAction } from '@hearth/shared';

import type { AppConfig } from '../../config/index.js';
import type { RuntimeState } from '../../config/runtime-state.js';
import { HearthError } from '../../lib/errors.js';
import { MediaTokenIssuer } from './media-token.js';
import { ACTION_CHARS, PermissionRegistry, actionsFromPermissionString } from './permissions.js';
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

  /** `assertCan` for a path and everything inside it (`PermissionRegistry.allowsTree`). */
  assertCanTree(
    session: Session,
    action: PermissionAction,
    relativePath: string,
    exists: (relativePath: string) => boolean,
  ): void {
    const { username, permissions } = session;
    if (!this.permissions.allowsTree(username, permissions, relativePath, action, exists)) {
      throw HearthError.forbidden(
        `Something inside this folder is not yours to ${action}, so the folder cannot be either`,
      );
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

  /**
   * A token for one folder and everything below it, for an HTML page served
   * with its own images, styles, frames and linked pages. The `site:` prefix
   * keeps it from ever passing as a single-file media token.
   */
  issueSiteToken(username: string, folder: string): string {
    return this.mediaTokens.issue(username, `site:${folder}`, this.runtime.get('activeRootId'))
      .token;
  }

  /**
   * Who a link made earlier acts as (a page, a media token, a zip ticket): its
   * user as they are now, since the link may outlive a change. A removed user
   * gets nothing, admin-only mode locks others out as it does at sign-in, and
   * their current permissions apply, cut down to `most` when given.
   */
  sessionAsNow(username: string, id: string, most?: PermissionAction): Session {
    const user = this.users.list().find(candidate => candidate.username === username);
    if (!user) throw HearthError.unauthorized('This link is no longer valid');
    if (this.runtime.get('adminOnly') && !user.permissions.includes('a')) {
      throw HearthError.forbidden('The server is currently limited to administrators');
    }
    const allowed = actionsFromPermissionString(user.permissions);
    const permissions =
      most === undefined ? user.permissions : allowed.includes(most) ? ACTION_CHARS[most] : '';
    return { id, username, permissions, createdAt: Date.now(), expiresAt: null };
  }

  siteSession(username: string): Session {
    return this.sessionAsNow(username, 'site');
  }

  verifySiteToken(token: string): { username: string; folder: string } | null {
    const payload = this.mediaTokens.verify(token, this.runtime.get('activeRootId'));
    if (!payload?.path.startsWith('site:')) return null;
    return { username: payload.sub, folder: payload.path.slice('site:'.length) };
  }

  async close(): Promise<void> {
    await this.sessions.close();
  }
}
