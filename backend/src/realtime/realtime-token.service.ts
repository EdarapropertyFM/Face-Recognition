import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class RealtimeTokenService {
  issue(user: string, role: string, ttlSeconds = 300) {
    const body = Buffer.from(JSON.stringify({ user, role, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  verify(token: string) {
    const [body, signature] = token.split('.');
    const expected = body ? this.sign(body) : '';
    if (!body || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new UnauthorizedException('Invalid realtime token');
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as { exp: number };
      if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error();
      return payload;
    } catch { throw new UnauthorizedException('Expired realtime token'); }
  }

  private sign(body: string) {
    return createHmac('sha256', process.env.REALTIME_SIGNING_KEY || process.env.JWT_SECRET || 'stmc-local-realtime-key').update(body).digest('base64url');
  }
}
