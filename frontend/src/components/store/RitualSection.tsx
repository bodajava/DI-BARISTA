import Link from 'next/link';
import { getDictionary, type Locale } from '@/lib/i18n';

/**
 * Full-bleed coffee-bean photo with a prompt on the start side and three numbered
 * "moods" on the other, each leading to the matching shop tab.
 * Photo: Adam Lukac on Pexels (free licence), stored locally in /public/media/sections.
 */
export function RitualSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).ritual;

  return (
    <section className="ritual" data-nav="dark" aria-labelledby="ritual-lead">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="ritual-bg"
        data-parallax="8"
        src="/media/sections/coffee-beans-2400.webp"
        srcSet="/media/sections/coffee-beans-1200.webp 1200w, /media/sections/coffee-beans-2400.webp 2400w"
        sizes="100vw"
        alt=""
        loading="lazy"
        decoding="async"
      />
      <div className="ritual-shade" aria-hidden="true" />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="ritual-mark" src="/media/brand-mark.png" alt="" width={104} height={104} />

      <div className="ritual-content">
        <p id="ritual-lead" className="ritual-lead" data-reveal>
          {t.lead}
        </p>

        <div className="ritual-list-wrap">
          <h2 className="ritual-eyebrow ui-caps" data-reveal>{t.eyebrow}</h2>
          <ol className="ritual-list" data-reveal-group>
            {t.items.map((item, i) => (
              <li key={item.tab}>
                <Link href={`/${locale}?tab=${item.tab}#catalog`} className="ritual-link">
                  <sup className="ritual-index">{i + 1}</sup>
                  <span className="ritual-title">{item.title}</span>
                  <span className="ritual-arrow flip-rtl" aria-hidden="true">
                    →
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
