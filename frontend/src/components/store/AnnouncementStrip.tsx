import { Suspense } from 'react';
import { isLocale, type Locale } from '@/lib/i18n';
import { getAnnouncementLines } from '@/lib/site-settings';

/** Copies per half: one half must be wider than the widest screen so no gap ever shows */
const MIN_ITEMS = 12;

async function Strip({ locale }: { locale: string | Promise<string> }) {
  const resolved = await locale;
  const lang: Locale = isLocale(resolved) ? resolved : 'en';
  const lines = await getAnnouncementLines(lang);
  if (!lines) return <div className="hero-strip" aria-hidden="true" />;

  const items = Array.from({ length: Math.max(2, Math.ceil(MIN_ITEMS / lines.length)) }, () => lines).flat();
  // Same reading speed whatever the number of lines (~4s per line)
  const duration = `${items.length * 4}s`;
  const half = (key: string) => (
    <div className="announce-half" key={key}>
      {items.map((text, i) => (
        <span key={i} className="announce-item" lang={/[؀-ۿ]/.test(text) ? 'ar' : 'en'}>
          {text}
        </span>
      ))}
    </div>
  );

  return (
    <div className="hero-strip announce" role="region" aria-label={lang === 'ar' ? 'عروض وأخبار' : 'Offers and news'}>
      {/* Screen readers get each line once; the moving copies are decoration */}
      <ul className="sr-only">
        {lines.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
      <div className="announce-track" aria-hidden="true" dir="ltr" style={{ animationDuration: duration }}>
        {half('a')}
        {half('b')}
      </div>
    </div>
  );
}

/**
 * The crema strip at the top of every page frame, carrying the scrolling offers set in
 * Dashboard → Marketing → "Scrolling text above the menu". Plain strip when that's off.
 */
export function AnnouncementStrip({ locale }: { locale: string | Promise<string> }) {
  return (
    <Suspense fallback={<div className="hero-strip" aria-hidden="true" />}>
      <Strip locale={locale} />
    </Suspense>
  );
}
