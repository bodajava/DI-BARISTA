import Link from 'next/link';
import { getDictionary, type Locale } from '@/lib/i18n';

/** "Our story": brand text beside a large photo (target of the nav "Story" link) */
export function StorySection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).story;
  return (
    <section id="story" className="story" data-nav="page" aria-labelledby="story-title">
      <div className="story-text">
        <p className="story-eyebrow ui-caps" data-reveal>
          {t.eyebrow}
        </p>
        <h2 id="story-title" className="story-title" data-reveal>
          {t.title}
        </h2>
        <p className="story-body" data-reveal>
          {t.body}
        </p>
        <Link href={`/${locale}#shop`} className="story-link" data-reveal>
          {t.link}
        </Link>
      </div>
      <div className="story-media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/media/story/beans-bowls.webp" alt={t.alt} loading="lazy" decoding="async" data-zoom />
      </div>
    </section>
  );
}
