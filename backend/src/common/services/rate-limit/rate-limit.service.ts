import { Injectable } from '@nestjs/common';
import { CacheService } from '../../utilities/caching';

export interface IRateLimitResult {
  allowed: boolean;
  count: number;
  retryAfterSeconds: number;
}

/**
 * Fixed-window counter backed by Redis, with an in-process fallback so limits keep
 * working (per instance) when Redis is unavailable instead of failing open.
 */
@Injectable()
export class RateLimitService {
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(private readonly cacheService: CacheService) {}

  async hit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<IRateLimitResult> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.cacheService.incr(redisKey);

    if (count > 0) {
      if (count === 1) {
        await this.cacheService.expire({ key: redisKey, ttl: windowSeconds });
      }
      const ttl = await this.cacheService.ttl(redisKey);
      return {
        allowed: count <= limit,
        count,
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return this.hitMemory(redisKey, limit, windowSeconds);
  }

  async reset(key: string): Promise<void> {
    const redisKey = `ratelimit:${key}`;
    this.memory.delete(redisKey);
    await this.cacheService.del(redisKey);
  }

  private hitMemory(
    key: string,
    limit: number,
    windowSeconds: number,
  ): IRateLimitResult {
    const now = Date.now();
    let entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowSeconds * 1000 };
      this.memory.set(key, entry);
    }
    entry.count += 1;

    if (this.memory.size > 10_000) {
      for (const [k, v] of this.memory) {
        if (v.resetAt <= now) this.memory.delete(k);
      }
    }

    return {
      allowed: entry.count <= limit,
      count: entry.count,
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }
}
