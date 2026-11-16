import { SetMetadata } from '@nestjs/common';

export const CACHE_TTL_METADATA = 'CACHE_TTL_METADATA';
export const CACHE_PERSONAL_USER_METADATA = 'CACHE_PERSONAL_USER_METADATA';

/**
 * Sets cache Time-To-Live (in seconds) metadata for CustomCacheInterceptor
 */
export const TTL = (seconds: number = 10) =>
  SetMetadata(CACHE_TTL_METADATA, seconds);

/**
 * Enables or disables per-user scoped cache keys in CustomCacheInterceptor
 */
export const PersonalCache = (enabled: boolean = false) =>
  SetMetadata(CACHE_PERSONAL_USER_METADATA, enabled);

