import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHmac, timingSafeEqual } from 'crypto';
import { IS_INTERNAL, IS_PUBLIC } from './auth.decorators';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(context: ExecutionContext) {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()])) return true;
    const request = context.switchToHttp().getRequest();
    if (this.reflector.getAllAndOverride<boolean>(IS_INTERNAL, [context.getHandler(), context.getClass()])) {
      if (request.headers['x-stmc-ai-token'] === (process.env.STMC_AI_EVENT_TOKEN || 'stmc-ai-dev-token')) return true;
      throw new UnauthorizedException('Invalid AI service token');
    }
    const token = request.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Authentication token is required');
    const [encoded, signature] = token.split('.');
    const expected = createHmac('sha256', process.env.JWT_SECRET || 'change-this-development-secret').update(encoded).digest('base64url');
    if (!encoded || !signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) throw new UnauthorizedException('Invalid authentication token');
    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
      if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw new Error();
      request.user = payload;
      return true;
    } catch { throw new UnauthorizedException('Expired authentication token'); }
  }
}
