import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT, RateLimitOptions } from './rate-limit.decorator';

type Bucket = { count: number; resetsAt: number };

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const options = this.reflector.get<RateLimitOptions>(RATE_LIMIT, context.getHandler());
    if (!options) return true;
    const request = context.switchToHttp().getRequest();
    const now = Date.now();
    const ip = request.ip || request.socket?.remoteAddress || 'unknown';
    const key = `${request.route?.path ?? request.url}:${ip}`;
    const current = this.buckets.get(key);

    if (!current || current.resetsAt <= now) {
      this.buckets.set(key, { count: 1, resetsAt: now + options.windowMs });
      this.cleanup(now);
      return true;
    }
    if (current.count >= options.limit) {
      throw new HttpException('Too many requests. Please wait and try again.', 429);
    }
    current.count += 1;
    return true;
  }

  private cleanup(now: number) {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) if (bucket.resetsAt <= now) this.buckets.delete(key);
  }
}
