import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/store/PageHeader';
import { SiteFooter } from '@/components/store/SiteFooter';
import { ProductView } from '@/components/store/product/ProductView';
import { ProductTile } from '@/components/store/shop/ProductTile';
import { RevealHere } from '@/components/store/motion/RevealHere';
import { getDictionary, isLocale, LOCALE_META } from '@/lib/i18n';
import { SITE_NAME, SITE_URL, toJsonLd } from '@/lib/site';
import {
  getRelatedProducts,
  getStoreCatalog,
  getStoreProductDetail,
} from '@/lib/storefront-products';

type Params = { params: Promise<{ locale: string; slug: string }> };

const absolute = (src?: string) =>
  !src ? undefined : src.startsWith('http') ? src : `${SITE_URL}${src}`;

/** Pre-render every product page at build time; new products render on first visit */
export async function generateStaticParams() {
  const catalog = await getStoreCatalog('en');
  const slugs = catalog.map((p) => ({ slug: p.slug }));
  // Cache Components needs at least one value; this one simply 404s
  return slugs.length ? slugs : [{ slug: 'coming-soon' }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const product = await getStoreProductDetail(locale, slug);
  if (!product) return { robots: { index: false } };
  const description = (product.description || product.notes || '').slice(0, 160);
  const image = absolute(product.images[0]);
  return {
    title: product.name,
    description,
    alternates: {
      canonical: `/${locale}/products/${slug}`,
      languages: { en: `/en/products/${slug}`, ar: `/ar/products/${slug}` },
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: LOCALE_META[locale].ogLocale,
      url: `/${locale}/products/${slug}`,
      title: product.name,
      description,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
  };
}

/** Everything that depends on the URL streams in behind a skeleton, so navigation is instant */
async function ProductContent({ params }: Params) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const product = await getStoreProductDetail(locale, slug);
  if (!product) notFound();

  const dict = getDictionary(locale);
  const related = await getRelatedProducts(locale, product);
  const tabName = product.tab !== 'all' ? dict.shop.tabs[product.tab] : '';

  // Product rich result: name, photos, price and availability
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    sku: product.sku,
    image: product.images.map(absolute).filter(Boolean),
    description: product.description || product.notes,
    brand: { '@type': 'Brand', name: 'DI BARISTA' },
    offers: {
      '@type': 'Offer',
      url: `${SITE_URL}/${locale}/products/${product.slug}`,
      priceCurrency: 'EGP',
      price: (product.priceCents / 100).toFixed(2),
      availability:
        product.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    },
  };

  return (
    <>
      <main id="main" className="pd-page" data-nav="page" data-stream>
        <RevealHere watch={product.slug} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: toJsonLd(jsonLd) }} />
        <ProductView product={product} locale={locale} />

        {related.length > 0 && (
          <section className="pd-related" aria-labelledby="related-title">
            <h2 id="related-title" className="pd-related-title ui-caps">
              {tabName ? dict.product.related(tabName) : dict.product.relatedAll}
            </h2>
            <ul className="shop-grid" data-reveal-group>
              {related.map((p) => (
                <li key={p.id}>
                  <ProductTile product={p} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}

function ProductSkeleton() {
  return (
    <main className="pd-page" data-nav="page" aria-hidden="true">
      <div className="pd">
        <div className="pd-stage tile-skeleton" />
        <div className="pd-info">
          <span className="skeleton-line" style={{ width: '40%' }} />
          <span className="skeleton-line" style={{ height: 28 }} />
          <span className="skeleton-line short" />
        </div>
      </div>
    </main>
  );
}

export default function ProductPage({ params }: Params) {
  return (
    <>
      <PageHeader />
      <Suspense fallback={<ProductSkeleton />}>
        <ProductContent params={params} />
      </Suspense>
    </>
  );
}
