import type { MetadataRoute } from 'next';
import { LOCALES } from '@/lib/i18n';
import { SITE_URL } from '@/lib/site';
import { getStoreCatalog } from '@/lib/storefront-products';

/** Home + every product page, in both languages with hreflang alternates */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pairs = (path: string) =>
    Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`]));

  const home: MetadataRoute.Sitemap = LOCALES.map((locale) => ({
    url: `${SITE_URL}/${locale}`,
    changeFrequency: 'daily',
    priority: 1,
    alternates: { languages: pairs('') },
  }));

  const catalog = await getStoreCatalog('en');
  const products: MetadataRoute.Sitemap = catalog.flatMap((p) =>
    LOCALES.map((locale) => ({
      url: `${SITE_URL}/${locale}/products/${encodeURIComponent(p.slug)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
      alternates: { languages: pairs(`/products/${encodeURIComponent(p.slug)}`) },
      images: p.images.slice(0, 4).map((u) => (u.startsWith('http') ? u : `${SITE_URL}${u}`)),
    })),
  );

  return [...home, ...products];
}
