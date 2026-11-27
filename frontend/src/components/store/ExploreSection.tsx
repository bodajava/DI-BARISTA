import Link from 'next/link';
import { getDictionary, type Locale } from '@/lib/i18n';
import { getStoreCatalog, type IStoreProduct } from '@/lib/storefront-products';
import { AmbientVideo } from './AmbientVideo';
import { NewsletterForm } from './NewsletterForm';

type RowKey = 'capsules' | 'beans' | 'arabic' | 'bestsellers';

const ROWS: Array<{ key: RowKey; pick: (p: IStoreProduct) => boolean; href: string }> = [
  { key: 'capsules', pick: (p) => p.categorySlugs.includes('coffee-capsules'), href: '?tab=capsules' },
  { key: 'beans', pick: (p) => p.categorySlugs.includes('coffee-beans'), href: '?tab=beans' },
  { key: 'arabic', pick: (p) => p.categorySlugs.includes('grinded'), href: '?tab=arabic' },
  // Real best sellers: only pieces that actually sold, most sold first
  { key: 'bestsellers', pick: (p) => p.soldCount > 0, href: '' },
];

/** "What are you looking for?": category rows with pack shots, an espresso video, and the newsletter form */
export async function ExploreSection({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.explore;
  const catalog = await getStoreCatalog(locale);
  const ROW_SIZE = 4;

  // Always 4 per row: photographed products of the row first. Category rows top up with the
  // rest of the same category (brand tile until a photo is uploaded); best sellers top up with
  // other photographed products, never with a different category under a category label.
  const rows = ROWS.map((row) => {
    const inRow = catalog.filter(row.pick);
    const picked = [
      ...inRow.filter((p) => p.hasPhotos),
      ...inRow.filter((p) => !p.hasPhotos),
    ];
    if (row.key === 'bestsellers') {
      return { ...row, products: [...inRow].sort((a, b) => b.soldCount - a.soldCount).slice(0, ROW_SIZE) };
    }
    return { ...row, products: picked.slice(0, ROW_SIZE) };
  }).filter((row) => row.products.length > 0);

  return (
    <section className="explore" data-nav="page" aria-labelledby="explore-heading">
      <div className="explore-grid">
        <div className="explore-left">
          <h2 id="explore-heading" className="explore-eyebrow ui-caps" data-reveal>
            {t.eyebrow}
          </h2>
          <p className="explore-intro" data-reveal>
            {t.intro}
          </p>

          <ul className="explore-rows" data-reveal-group>
            {rows.map((row) => (
              <li key={row.key}>
                <Link href={`/${locale}${row.href}#catalog`} className="explore-row">
                  <span className="explore-row-label">{t.rows[row.key]}</span>
                  <span className="explore-thumbs">
                    {row.products.map((p) =>
                      p.hasPhotos && p.images[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={p.id}
                          src={p.images[0]}
                          alt={p.name}
                          title={p.name}
                          width={300}
                          height={300}
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <span key={p.id} className="explore-thumb-placeholder" title={p.name}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src="/media/brand-mark.png" alt="" width={40} height={40} />
                          <span className="sr-only">{p.name}</span>
                        </span>
                      ),
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="explore-media" role="img" aria-label={t.videoLabel}>
          <AmbientVideo
            className="explore-video"
            poster="/media/explore/espresso-poster.webp"
            sources={[
              { src: '/media/explore/espresso-840.mp4', media: '(max-width: 767px)' },
              { src: '/media/explore/espresso-1440.mp4' },
            ]}
          />
        </div>
      </div>

      <NewsletterForm locale={locale} />
    </section>
  );
}
