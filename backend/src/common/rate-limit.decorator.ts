import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT = 'stmcRateLimit';
export type RateLimitOptions = { limit: number; windowMs: number };
export const RateLimit = (options: RateLimitOptions) => SetMetadata(RATE_LIMIT, options);
