import Link from 'next/link';
import { getDictionary, type Locale } from '@/lib/i18n';

/** "Our world": a feature story with a large photo, plus three smaller stories linking into the shop */
export function JournalSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).journal;

  return (
    <section className="journal" data-nav="page" aria-labelledby="journal-heading">
      <h2 id="journal-heading" className="sr-only">
        {t.heading}
      </h2>
      <div className="journal-grid">
        <Link href={`/${locale}#shop`} className="journal-feature-text" data-reveal>
          <span className="journal-eyebrow ui-caps">{t.feature.eyebrow}</span>
          <span className="journal-feature-title">{t.feature.title}</span>
        </Link>

        <Link href={`/${locale}#shop`} className="journal-feature-media" tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/journal/feature.webp" alt="" loading="lazy" decoding="async" data-zoom />
        </Link>

        <ul className="journal-list" data-reveal-group>
          {t.items.map((item) => (
            <li key={item.image}>
              <Link href={`/${locale}?tab=${item.tab}#catalog`} className="journal-item">
                <span className="journal-item-text">
                  <span className="journal-eyebrow ui-caps">{item.eyebrow}</span>
                  <span className="journal-item-title">{item.title}</span>
                </span>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="journal-thumb"
                  src={item.image}
                  alt={item.alt}
                  width={300}
                  height={300}
                  loading="lazy"
                  decoding="async"
                />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
