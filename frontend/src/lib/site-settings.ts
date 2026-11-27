import { cacheLife, cacheTag } from 'next/cache';
import type { Locale } from '@/lib/i18n';
import { nestFetch } from '@/lib/nest-client';

/**
 * Store settings the storefront may read (contact links, scrolling offers…), edited in the
 * dashboard. Cached for minutes; a dashboard save expires the "settings" tag immediately.
 */
export async function getPublicSettings(): Promise<Record<string, unknown>> {
  'use cache';
  cacheTag('settings');
  try {
    const res = await nestFetch<Record<string, unknown>>('/settings/public');
    cacheLife('minutes');
    return res.data ?? {};
  } catch {
    // API unreachable: try again soon instead of keeping an empty strip for long
    cacheLife('seconds');
    return {};
  }
}

type Marquee = { enabled?: boolean; lines?: Array<{ en?: string; ar?: string }> };

/** Lines of the offers strip above the menu in this language, or null when it's off/empty */
export async function getAnnouncementLines(locale: Locale): Promise<string[] | null> {
  const settings = await getPublicSettings();
  const bar = settings['marquee.top'] as Marquee | undefined;
  if (!bar || !bar.enabled || !Array.isArray(bar.lines)) return null;
  const lines = bar.lines
    .map((l) => String((locale === 'ar' ? l.ar || l.en : l.en || l.ar) ?? '').trim())
    .filter(Boolean);
  return lines.length ? lines : null;
}
