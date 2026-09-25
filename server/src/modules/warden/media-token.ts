import crypto from 'node:crypto';

/**
 * Short-lived HMAC token authorising one path for one user, for URLs handed to
 * elements or apps that cannot send the session cookie.
 */
export interface MediaTokenPayload {
  sub: string;
  path: string;
  /** A root switch invalidates outstanding tokens. */
  root: string;
  /** Null when tokens never expire. */
  exp: number | null;
}

export class MediaTokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number,
  ) {}

  issue(
    username: string,
    relativePath: string,
    rootId: string,
  ): { token: string; expiresAt: number } {
    const payload: MediaTokenPayload = {
      sub: username,
      path: relativePath,
      root: rootId,
      exp: Number.isFinite(this.ttlSeconds)
        ? Math.floor(Date.now() / 1000) + this.ttlSeconds
        : null,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {
      token: `${body}.${this.sign(body)}`,
      expiresAt: payload.exp === null ? Number.POSITIVE_INFINITY : payload.exp * 1000,
    };
  }

  verify(token: string, rootId: string): MediaTokenPayload | null {
    const separator = token.lastIndexOf('.');
    if (separator < 0) return null;

    const body = token.slice(0, separator);
    const signature = Buffer.from(token.slice(separator + 1));
    const expected = Buffer.from(this.sign(body));
    if (signature.length !== expected.length || !crypto.timingSafeEqual(signature, expected)) {
      return null;
    }

    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as MediaTokenPayload;
      if (payload.exp !== null && payload.exp < Math.floor(Date.now() / 1000)) return null;
      if (payload.root !== rootId) return null;
      return payload;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
