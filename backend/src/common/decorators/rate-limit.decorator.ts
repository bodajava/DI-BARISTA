import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface IRateLimitOptions {
  /** Max requests per window for one client IP */
  limit: number;
  /** Window length in seconds */
  windowSeconds: number;
  /** Optional body field (e.g. "email") that gets its own counter, so rotating IPs doesn't help */
  bodyKey?: string;
}

export const RateLimit = (options: IRateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);
