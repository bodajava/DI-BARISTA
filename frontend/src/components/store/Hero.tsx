import { getDictionary, type Locale } from '@/lib/i18n';
import { getHeroProducts } from '@/lib/storefront-products';
import { HeroMedia } from './HeroMedia';
import { HeroProductCard } from './HeroProductCard';

/** Brand wordmark: kept in Latin in both languages, like the logo */
export const WORDMARK = 'DI BARISTA';

export async function Hero({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const products = await getHeroProducts(locale);

  return (
    <header className="hero-frame" data-nav="dark">
      <div className="hero-strip" aria-hidden="true" />
      <div className="hero-stage">
        <HeroMedia t={t.hero} />
        <div className="hero-shade" aria-hidden="true" />

        <h1 className="hero-wordmark">
          <span className="sr-only">{t.hero.heading}</span>
          {/* textLength spreads the letters edge to edge at any screen width */}
          <svg
            viewBox="0 0 1400 118"
            role="presentation"
            aria-hidden="true"
            focusable="false"
          >
            <text
              x="0"
              y="118"
              textLength="1400"
              lengthAdjust="spacing"
              direction="ltr"
            >
              {WORDMARK}
            </text>
          </svg>
        </h1>

        {products.length > 0 && (
          <HeroProductCard
            products={products}
            t={t.hero}
            roastNames={t.roast}
            addingLabel={t.cart.adding}
            locale={locale}
          />
        )}
      </div>
    </header>
  );
}
