import type { AppConfig } from './config/index.js';
import type { RuntimeState } from './config/runtime-state.js';
import type { SafePath, Vault } from './lib/vault.js';
import type { Warden } from './modules/warden/warden.js';
import type { Session } from './modules/warden/session-store.js';
import type { PermissionAction } from '@hearth/shared';

/** Assembled once at startup and reachable from every route as `app.hearth`. */
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

    /** The only way to obtain a `SafePath`: resolves against the active root and authorises `action` in one step. */
    resolvePath(userPath: string | undefined, action: PermissionAction): SafePath;

    /** Root-relative, forward-slash form of an absolute path inside the root. */
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
    /**
     * Served into frames whose parent has an opaque origin (a sandboxed page's
     * own frameset), which X-Frame-Options: SAMEORIGIN would refuse; such
     * routes send their own CSP instead.
     */
    framable?: boolean;
  }
}
