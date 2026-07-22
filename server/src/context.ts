import type { AppConfig } from './config/index.js';
import type { RuntimeState } from './config/runtime-state.js';
import type { SafePath, Vault } from './lib/vault.js';
import type { Warden } from './modules/warden/warden.js';
import type { Session } from './modules/warden/session-store.js';
import type { PermissionAction } from '@hearth/shared';

/**
 * The service container, assembled once at startup and reachable from every
 * route as `app.hearth`. Constructor injection keeps modules testable without
 * a framework instance.
 */
export interface HearthContext {
  config: AppConfig;
  runtime: RuntimeState;
  vault: Vault;
  warden: Warden;
}

declare module 'fastify' {
  interface FastifyInstance {
    hearth: HearthContext;
  }

  interface FastifyRequest {
    /** Present once the auth hook has run and the route is not public. */
    session: Session | null;

    /**
     * The only way to obtain a `SafePath`. Resolves a user-supplied path
     * against the active root and authorises `action` against it in one step,
     * so no filesystem call can be reached without a permission check.
     */
    resolvePath(userPath: string | undefined, action: PermissionAction): SafePath;

    /** Root-relative form of the last resolved path, for logging and responses. */
    relativePath(absolute: string): string;
  }

  interface FastifyContextConfig {
    /**
     * - `session` (default) — a valid session cookie is required.
     * - `public` — no authentication, e.g. login and health.
     * - `media-token` — a session cookie *or* a path-bound media token.
     */
    auth?: 'session' | 'public' | 'media-token';
    /** Verb enforced against the user's global permissions before the handler runs. */
    permission?: PermissionAction;
  }
}
