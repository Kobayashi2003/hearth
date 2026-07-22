import crypto from 'node:crypto';

/**
 * Short-lived HMAC token authorising one path for one user. Stream URLs are put
 * into `<video src>` and `<img src>` attributes, which cannot carry an
 * Authorization header, and a media element started before a session refresh
 * must keep working — so streams authenticate with this instead of the cookie.
 *
 * The token is bound to a single path, so possessing one grants nothing else.
 */
export interface MediaTokenPayload {
  /** Username the token was issued to. */
  sub: string;
  /** Root-relative path the token authorises. */
  path: string;
  /** Root the path is relative to; a root switch invalidates outstanding tokens. */
  root: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

export class MediaTokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly ttlSeconds: number,
  ) {}

  issue(username: string, relativePath: string, rootId: string): { token: string; expiresAt: Date } {
    const payload: MediaTokenPayload = {
      sub: username,
      path: relativePath,
      root: rootId,
      exp: Math.floor(Date.now() / 1000) + this.ttlSeconds,
    };
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return {
      token: `${body}.${this.sign(body)}`,
      expiresAt: new Date(payload.exp * 1000),
    };
  }

  /** Returns the payload only when the signature, expiry, and root all hold. */
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
      if (payload.exp < Math.floor(Date.now() / 1000)) return null;
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
