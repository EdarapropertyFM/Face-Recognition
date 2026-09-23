import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  it('rejects requests after the configured per-IP limit', () => {
    const reflector = { get: jest.fn().mockReturnValue({ limit: 2, windowMs: 60_000 }) } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector);
    const request = { ip: '127.0.0.9', route: { path: '/face-check' }, url: '/face-check', headers: {}, socket: {} };
    const context = {
      getHandler: () => function handler() {},
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(guard.canActivate(context)).toBe(true);
    expect(() => guard.canActivate(context)).toThrow(HttpException);
  });

  it('keeps separate buckets for different IP addresses', () => {
    const reflector = { get: jest.fn().mockReturnValue({ limit: 1, windowMs: 60_000 }) } as unknown as Reflector;
    const guard = new RateLimitGuard(reflector);
    const makeContext = (ip: string) => ({
      getHandler: () => function handler() {},
      switchToHttp: () => ({ getRequest: () => ({ ip, route: { path: '/submit' }, url: '/submit', headers: {}, socket: {} }) }),
    }) as unknown as ExecutionContext;

    expect(guard.canActivate(makeContext('10.0.0.1'))).toBe(true);
    expect(guard.canActivate(makeContext('10.0.0.2'))).toBe(true);
  });
});
