import { Suspense } from 'react';
import Link from 'next/link';
import { getDictionary, type Locale } from '@/lib/i18n';
import {
  SHOP_PAGE_SIZE,
  SHOP_TABS,
  getStoreCatalog,
  isShopTab,
  paginateCatalog,
  type ShopTab,
} from '@/lib/storefront-products';
import { ProductTile } from './ProductTile';
import { RevealHere } from '../motion/RevealHere';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** /en?tab=beans&page=2#catalog: shareable, crawlable, and the browser's back button works */
function shopHref(locale: Locale, tab: ShopTab, page: number): string {
  const params = new URLSearchParams();
  if (tab !== 'all') params.set('tab', tab);
  if (page > 1) params.set('page', String(page));
  const query = params.toString();
  return `/${locale}${query ? `?${query}` : ''}#catalog`;
}

function pageList(current: number, total: number): Array<number | 'gap'> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | 'gap'> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

async function ShopCatalog({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: SearchParams;
}) {
  const t = getDictionary(locale).shop;
  const params = await searchParams;
  const tabParam = first(params.tab);
  const tab: ShopTab = isShopTab(tabParam) ? tabParam : 'all';
  const requestedPage = Number.parseInt(first(params.page) ?? '1', 10) || 1;

  const catalog = await getStoreCatalog(locale);
  const { items, page, totalPages, total } = paginateCatalog(
    catalog,
    tab,
    requestedPage,
  );
  const shownUpTo = Math.min(page * SHOP_PAGE_SIZE, total);

  return (
    <div data-stream>
      <RevealHere watch={`${tab}-${page}`} />
      <nav id="catalog" className="shop-tabs" aria-label={t.tabsLabel}>
        {SHOP_TABS.map(({ key }) => (
          <Link
            key={key}
            href={shopHref(locale, key, 1)}
            className="shop-tab"
            aria-current={key === tab ? 'page' : undefined}
            scroll={false}
          >
            {t.tabs[key]}
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <p className="shop-empty">{t.empty}</p>
      ) : (
        <ul className="shop-grid" data-reveal-group>
          {items.map((product) => (
            <li key={product.id}>
              <ProductTile product={product} locale={locale} />
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="shop-pagination" aria-label={t.pagination}>
          <p className="shop-count">{t.showing(shownUpTo, total)}</p>
          <div className="shop-pages">
            {page > 1 ? (
              <Link className="page-step" href={shopHref(locale, tab, page - 1)} rel="prev" scroll={false}>
                <span className="flip-rtl" aria-hidden="true">‹</span> {t.previous}
              </Link>
            ) : (
              <span className="page-step" aria-disabled="true">
                <span className="flip-rtl" aria-hidden="true">‹</span> {t.previous}
              </span>
            )}

            <ol className="page-numbers">
              {pageList(page, totalPages).map((p, i) =>
                p === 'gap' ? (
                  <li key={`gap-${i}`} className="page-gap" aria-hidden="true">
                    …
                  </li>
                ) : (
                  <li key={p}>
                    <Link
                      className="page-number"
                      href={shopHref(locale, tab, p)}
                      aria-label={t.page(p)}
                      aria-current={p === page ? 'page' : undefined}
                      scroll={false}
                    >
                      {p.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en')}
                    </Link>
                  </li>
                ),
              )}
            </ol>

            {page < totalPages ? (
              <Link className="page-step" href={shopHref(locale, tab, page + 1)} rel="next" scroll={false}>
                {t.next} <span className="flip-rtl" aria-hidden="true">›</span>
              </Link>
            ) : (
              <span className="page-step" aria-disabled="true">
                {t.next} <span className="flip-rtl" aria-hidden="true">›</span>
              </span>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function ShopSkeleton() {
  return (
    <>
      <div className="shop-tabs shop-tabs-skeleton" aria-hidden="true" />
      <ul className="shop-grid" aria-hidden="true">
        {Array.from({ length: SHOP_PAGE_SIZE }, (_, i) => (
          <li key={i}>
            <div className="tile tile-skeleton">
              <div className="tile-frame">
                <div className="tile-media" />
              </div>
              <div className="tile-info">
                <span className="skeleton-line" />
                <span className="skeleton-line short" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/** Brand statement + tabbed, paginated product grid (the section under the hero) */
export function ShopSection({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: SearchParams;
}) {
  const t = getDictionary(locale).shop;
  return (
    <section id="shop" className="shop" data-nav="page" aria-labelledby="shop-heading">
      <p className="shop-intro" data-reveal>
        {t.intro}
      </p>
      <h2 id="shop-heading" className="sr-only">
        {t.heading}
      </h2>
      <Suspense fallback={<ShopSkeleton />}>
        <ShopCatalog locale={locale} searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
