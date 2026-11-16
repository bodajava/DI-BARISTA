import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface ICacheSetOptions<T = unknown> {
  key: string;
  value: T;
  ttl?: number;
}

export interface ICacheExpireOptions {
  key: string;
  ttl: number;
}

/**
 * Redis Key Generator Helpers
 */
export const revokeTokenKey = (jtiOrUserId: string): string =>
  `auth:revoked:${jtiOrUserId}`;

export const otpKey = (
  identifier: string,
  purpose: string = 'verify',
): string => `auth:otp:${purpose}:${identifier.toLowerCase().trim()}`;

export const blockOtpKey = (identifier: string): string =>
  `auth:otp:block:${identifier.toLowerCase().trim()}`;

export const maxAttemptOtp = (identifier: string): string =>
  `auth:otp:attempts:${identifier.toLowerCase().trim()}`;

export const pendingUserKey = (email: string): string =>
  `auth:pending-user:${email.toLowerCase().trim()}`;

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client: Redis;
  private readonly keyPrefix: string;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {
    const redisUri =
      this.configService.get<string>('REDIS_URI') ||
      process.env.REDIS_URI ||
      '';
    this.keyPrefix = this.configService.get<string>(
      'REDIS_KEY_PREFIX',
      'dibaresta:',
    );

    const commonOptions: RedisOptions = {
      keyPrefix: this.keyPrefix,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 5) {
          this.logger.warn(
            'Redis retry limit reached. Operating in degraded cache-bypass mode.',
          );
          return null;
        }
        return Math.min(times * 250, 2000);
      },
    };

    if (redisUri) {
      const useTls = redisUri.startsWith('rediss://');
      this.client = new Redis(redisUri, {
        ...commonOptions,
        tls: useTls ? {} : undefined,
      });
    } else {
      const host = this.configService.get<string>('REDIS_HOST', '127.0.0.1');
      const port = Number(this.configService.get<number>('REDIS_PORT', 6379));
      const password = this.configService.get<string>('REDIS_PASSWORD', '');
      const db = Number(this.configService.get<number>('REDIS_DB', 0));

      this.client = new Redis({
        ...commonOptions,
        host,
        port,
        password: password || undefined,
        db,
      });
    }

    this.client.on('connect', () => {
      this.isConnected = true;
      this.logger.log(
        `Connected to Redis (${redisUri ? 'Upstash TLS URI' : 'Local'})`,
      );
    });

    this.client.on('error', (error: Error) => {
      this.isConnected = false;
      this.logger.debug(`Redis connection error: ${error.message}`);
    });

    this.client.connect().catch((err: Error) => {
      this.logger.warn(
        `Initial Redis connection deferred (${err.message}). Caching will fail-open until Redis is available.`,
      );
    });
  }

  /**
   * Generates a composite cache key from URL/field path and optional userId
   */
  getCacheKey(url: string, userId?: string): string {
    const normalizedUrl = (url || '/').trim();
    return userId
      ? `cache:user:${userId}:${normalizedUrl}`
      : `cache:public:${normalizedUrl}`;
  }

  /**
   * Retrieve a JSON-serialized value from Redis by key, automatically reviving ISO dates to Date instances
   */
  async get<T = unknown>(key: string): Promise<T | null> {
    if (!this.isConnected) return null;
    try {
      const raw = await this.client.get(key);
      if (raw === null) return null;
      try {
        return JSON.parse(raw, (_k, val) => {
          if (typeof val === 'string' && ISO_DATE_REGEX.test(val)) {
            const parsedDate = new Date(val);
            if (!Number.isNaN(parsedDate.getTime())) {
              return parsedDate;
            }
          }
          return val;
        }) as T;
      } catch {
        return raw as unknown as T;
      }
    } catch (error) {
      this.logger.error(
        `Redis GET failed for key "${key}": ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Store a value in Redis with optional TTL (in seconds).
   * Supports both object signature set({ key, value, ttl }) and positional signature set(key, value, ttlSeconds).
   */
  async set<T = unknown>(options: ICacheSetOptions<T>): Promise<boolean>;
  async set(
    key: string,
    value: unknown,
    ttlSeconds?: number,
  ): Promise<boolean>;
  async set<T = unknown>(
    keyOrOptions: string | ICacheSetOptions<T>,
    valueArg?: unknown,
    ttlArg?: number,
  ): Promise<boolean> {
    if (!this.isConnected) return false;

    const key =
      typeof keyOrOptions === 'string' ? keyOrOptions : keyOrOptions.key;
    const value =
      typeof keyOrOptions === 'string' ? valueArg : keyOrOptions.value;
    const ttlSeconds =
      typeof keyOrOptions === 'string' ? ttlArg : keyOrOptions.ttl;

    try {
      const serialized =
        typeof value === 'string' ? value : JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.client.set(key, serialized, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, serialized);
      }
      return true;
    } catch (error) {
      this.logger.error(
        `Redis SET failed for key "${key}": ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Update an existing key in Redis, preserving or setting a new TTL
   */
  async update<T = unknown>({
    key,
    value,
    ttl,
  }: ICacheSetOptions<T>): Promise<boolean> {
    if (!this.isConnected) return false;
    const keyExists = await this.exists(key);
    if (!keyExists) return false;

    const effectiveTtl = ttl !== undefined ? ttl : await this.ttl(key);
    return this.set({
      key,
      value,
      ttl: effectiveTtl > 0 ? effectiveTtl : undefined,
    });
  }

  /**
   * Check whether a key exists in Redis
   */
  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      const count = await this.client.exists(key);
      return count > 0;
    } catch (error) {
      this.logger.error(
        `Redis EXISTS failed for key "${key}": ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Get remaining Time-To-Live (in seconds) for a key
   */
  async ttl(key: string): Promise<number> {
    if (!this.isConnected) return -2;
    try {
      return await this.client.ttl(key);
    } catch (error) {
      this.logger.error(
        `Redis TTL failed for key "${key}": ${(error as Error).message}`,
      );
      return -2;
    }
  }

  /**
   * Set or update expiration TTL (in seconds) for a key
   */
  async expire({ key, ttl }: ICacheExpireOptions): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      const result = await this.client.expire(key, ttl);
      return result === 1;
    } catch (error) {
      this.logger.error(
        `Redis EXPIRE failed for key "${key}": ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Delete one or more keys from Redis
   */
  async del(key: string | string[]): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      const keys = Array.isArray(key) ? key : [key];
      if (!keys.length) return 0;
      return await this.client.del(...keys);
    } catch (error) {
      this.logger.error(`Redis DEL failed: ${(error as Error).message}`);
      return 0;
    }
  }

  /**
   * Delete an array of keys from Redis
   */
  async deleteKeys(keys: string[]): Promise<number> {
    if (!keys || keys.length === 0) return 0;
    return this.del(keys);
  }

  /**
   * Find all keys matching a given prefix (stripped of global keyPrefix)
   */
  async findKeysByPrefix(prefix: string): Promise<string[]> {
    if (!this.isConnected) return [];
    try {
      const normalizedPrefix = prefix.endsWith('*') ? prefix : `${prefix}*`;
      const fullPattern = `${this.keyPrefix}${normalizedPrefix}`;
      const rawKeys = await this.client.keys(fullPattern);
      return rawKeys.map((k) =>
        k.startsWith(this.keyPrefix) ? k.slice(this.keyPrefix.length) : k,
      );
    } catch (error) {
      this.logger.error(
        `Redis findKeysByPrefix failed for "${prefix}": ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Delete all keys matching a pattern (e.g., "brands:*")
   */
  async delByPattern(pattern: string): Promise<number> {
    const keys = await this.findKeysByPrefix(pattern);
    if (!keys.length) return 0;
    return this.deleteKeys(keys);
  }

  /**
   * Atomically increment a numeric key
   */
  async incr(key: string): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      return await this.client.incr(key);
    } catch (error) {
      this.logger.error(
        `Redis INCR failed for key "${key}": ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * Atomically decrement a numeric key
   */
  async decr(key: string): Promise<number> {
    if (!this.isConnected) return 0;
    try {
      return await this.client.decr(key);
    } catch (error) {
      this.logger.error(
        `Redis DECR failed for key "${key}": ${(error as Error).message}`,
      );
      return 0;
    }
  }

  /**
   * FCM Token Set Operations (addFCM, removeFCM, getFCMs)
   */
  async addFCM(userId: string, token: string): Promise<number> {
    if (!this.isConnected || !userId || !token) return 0;
    try {
      return await this.client.sadd(`fcm:tokens:${userId}`, token);
    } catch (error) {
      this.logger.error(
        `Redis addFCM failed for user "${userId}": ${(error as Error).message}`,
      );
      return 0;
    }
  }

  async removeFCM(userId: string, token: string): Promise<number> {
    if (!this.isConnected || !userId || !token) return 0;
    try {
      return await this.client.srem(`fcm:tokens:${userId}`, token);
    } catch (error) {
      this.logger.error(
        `Redis removeFCM failed for user "${userId}": ${(error as Error).message}`,
      );
      return 0;
    }
  }

  async getFCMs(userId: string): Promise<string[]> {
    if (!this.isConnected || !userId) return [];
    try {
      return await this.client.smembers(`fcm:tokens:${userId}`);
    } catch (error) {
      this.logger.error(
        `Redis getFCMs failed for user "${userId}": ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * WebSocket Client Set Operations (addSocket, removeSocket, getSockets)
   */
  async addSocket(userId: string, socketId: string): Promise<number> {
    if (!this.isConnected || !userId || !socketId) return 0;
    try {
      return await this.client.sadd(`ws:sockets:${userId}`, socketId);
    } catch (error) {
      this.logger.error(
        `Redis addSocket failed for user "${userId}": ${(error as Error).message}`,
      );
      return 0;
    }
  }

  async removeSocket(userId: string, socketId: string): Promise<number> {
    if (!this.isConnected || !userId || !socketId) return 0;
    try {
      return await this.client.srem(`ws:sockets:${userId}`, socketId);
    } catch (error) {
      this.logger.error(
        `Redis removeSocket failed for user "${userId}": ${(error as Error).message}`,
      );
      return 0;
    }
  }

  async getSockets(userId: string): Promise<string[]> {
    if (!this.isConnected || !userId) return [];
    try {
      return await this.client.smembers(`ws:sockets:${userId}`);
    } catch (error) {
      this.logger.error(
        `Redis getSockets failed for user "${userId}": ${(error as Error).message}`,
      );
      return [];
    }
  }

  /**
   * Flush current Redis database
   */
  async flush(): Promise<boolean> {
    if (!this.isConnected) return false;
    try {
      await this.client.flushdb();
      this.logger.warn('Redis database flushed.');
      return true;
    } catch (error) {
      this.logger.error(`Redis FLUSHDB failed: ${(error as Error).message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit().catch(() => this.client.disconnect());
    }
  }
}
