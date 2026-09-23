import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

@Injectable()
export class StreamTokenService {
  issue(playbackId: string, ttlSeconds = 300) {
    const payload = Buffer.from(JSON.stringify({ playbackId, exp: Math.floor(Date.now() / 1000) + ttlSeconds })).toString('base64url');
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string, playbackId: string) {
    const [encoded, signature] = token.split('.');
    const expected = encoded ? this.sign(encoded) : '';
    if (!encoded || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid stream token');
    }
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString()) as { playbackId: string; exp: number };
      if (payload.playbackId !== playbackId || payload.exp < Math.floor(Date.now() / 1000)) throw new Error();
      return payload;
    } catch { throw new UnauthorizedException('Expired or invalid stream token'); }
  }

  private sign(payload: string) {
    const key = process.env.CAMERA_STREAM_SIGNING_KEY || process.env.JWT_SECRET || 'stmc-local-stream-signing-key';
    return createHmac('sha256', key).update(payload).digest('base64url');
  }
}
