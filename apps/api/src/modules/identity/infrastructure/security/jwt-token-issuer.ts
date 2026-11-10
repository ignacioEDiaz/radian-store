import { SignJWT, jwtVerify } from 'jose';
import type { SessionClaims, TokenIssuer } from '../../application/ports.js';

const ISSUER = 'radian-store';

/** Sesión firmada (HS256). La revocación efectiva se hace verificando el estado de la cuenta. */
export class JwtTokenIssuer implements TokenIssuer {
  private readonly key: Uint8Array;

  constructor(secret: string, private readonly ttlSeconds: number) {
    this.key = new TextEncoder().encode(secret);
  }

  issue(claims: SessionClaims): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ role: claims.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .sign(this.key);
  }

  async verify(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { issuer: ISSUER, algorithms: ['HS256'] });
      const role = payload['role'];
      if (typeof payload.sub !== 'string' || (role !== 'customer' && role !== 'admin')) return null;
      return { sub: payload.sub, role };
    } catch {
      return null;
    }
  }
}
