import { cacheLife, cacheTag } from 'next/cache';
import {
  fetchServerCategories,
  fetchServerProductBySlug,
  fetchServerProducts,
} from '@/lib/server-catalog';
import { LOCALE_META, type Locale } from '@/lib/i18n';
import type { ICategoryRef, IProduct } from '@/lib/types';
import { normalizeBilingualText } from '@/lib/arabic-search';

/** Shop tabs, mapped to the API's category slugs ("all" = no filter) */
export const SHOP_TABS = [
  { key: 'all', categorySlug: null },
  { key: 'capsules', categorySlug: 'coffee-capsules' },
  { key: 'beans', categorySlug: 'coffee-beans' },
  { key: 'arabic', categorySlug: 'grinded' },
] as const;
export type ShopTab = (typeof SHOP_TABS)[number]['key'];

export function isShopTab(value: string | undefined): value is ShopTab {
  return SHOP_TABS.some((t) => t.key === value);
}

export interface IStoreProduct {
  id: string;
  slug: string;
  name: string;
  notes: string;
  roastLevel: string;
  /** Pieces actually sold (from orders) */
  soldCount: number;
  /** 1-5, drawn as dots */
  roastScore: number;
  /** Formatted lowest price */
  price: string;
  /** More than one pack size: price is shown as "from" */
  hasOptions: boolean;
  images: string[];
  /** Real pack shots rather than the illustrated placeholders */
  hasPhotos: boolean;
  isFeatured: boolean;
  categorySlugs: string[];
  /** First grind the product is sold in; the API rejects grinds a product doesn't offer */
  defaultGrind: string;
}

/** Kept for the hero card, which uses the same shape */
export type IHeroProduct = IStoreProduct;

const ROAST_SCORE: Record<string, number> = {
  LIGHT: 1,
  MEDIUM_LIGHT: 2,
  MEDIUM: 3,
  MEDIUM_DARK: 4,
  DARK: 5,
  ESPRESSO: 5,
  ESPRESSO_ROAST: 5,
};

const PLACEHOLDER_PREFIX = '/images/catalog/';

function localizedName(p: IProduct, locale: Locale): string {
  if (locale === 'ar') return p.nameAr || p.name_ar || p.name;
  return p.name_en || p.name;
}

/** Flavour notes as written in the price list (English when there are no Arabic ones) */
function notesList(p: IProduct, locale: Locale): string[] {
  const ar = locale === 'ar' && p.tastingNotes_ar?.length ? p.tastingNotes_ar : null;
  return ar ?? (p.tastingNotes_en?.length ? p.tastingNotes_en : p.flavorNotes ?? []);
}

function localizedNotes(p: IProduct, locale: Locale): string {
  return notesList(p, locale).slice(0, 3).join(' · ');
}

function refId(ref: string | ICategoryRef | undefined | null): string {
  if (!ref) return '';
  return typeof ref === 'string' ? ref : ref.id || ref._id || '';
}

/**
 * The whole sellable catalog for one language, ordered for the storefront:
 * products with real photos first, then featured, then best sellers.
 * Cached for a few minutes, so the home page stays static and fast; when the API is
 * unreachable the list is empty and the sections render their empty states.
 */
export async function getStoreCatalog(locale: Locale): Promise<IStoreProduct[]> {
  'use cache';
  cacheTag('products');

  const [products, categories] = await Promise.all([
    fetchServerProducts(),
    fetchServerCategories(),
  ]);
  // An empty list almost always means the API was unreachable: keep it only for seconds,
  // so products reappear as soon as the API is back instead of after the full cache life.
  if (products.length === 0) cacheLife('seconds');
  else cacheLife('minutes');

  const slugById = new Map(
    categories
      .map((c) => [refId(c), c.slug] as const)
      .filter((entry): entry is [string, string] => Boolean(entry[0] && entry[1])),
  );

  const price = new Intl.NumberFormat(LOCALE_META[locale].intl, {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  });

  const soldCount = new Map(products.map((p) => [p.id, p.soldCount ?? 0]));

  return products
    .filter((p) => p.isActive && p.slug && (p.stock ?? 0) > 0)
    .map((p): IStoreProduct => {
      const images = (p.imageUrls ?? []).filter(Boolean);
      const hasPhotos =
        images.length > 0 && !images[0].startsWith(PLACEHOLDER_PREFIX);
      const categoryIds = [
        refId(p.categoryId as string | ICategoryRef),
        ...(p.categoryIds ?? []).map((c) => refId(c)),
      ];
      return {
        id: p.id,
        slug: p.slug,
        name: localizedName(p, locale),
        notes: localizedNotes(p, locale),
        roastLevel: p.roastLevel,
        soldCount: p.soldCount ?? 0,
        roastScore: ROAST_SCORE[p.roastLevel] ?? 0,
        price: price.format((p.finalPriceCents ?? p.priceCents) / 100),
        hasOptions: (p.variants?.length ?? 0) > 1,
        images,
        hasPhotos,
        isFeatured: Boolean(p.isFeatured),
        categorySlugs: [
          ...new Set(
            categoryIds
              .map((id) => slugById.get(id))
              .filter((slug): slug is string => Boolean(slug)),
          ),
        ],
        defaultGrind: p.availableGrinds?.[0] ?? 'WHOLE_BEAN',
      };
    })
    .sort(
      (a, b) =>
        Number(b.hasPhotos) - Number(a.hasPhotos) ||
        Number(b.isFeatured) - Number(a.isFeatured) ||
        (soldCount.get(b.id) ?? 0) - (soldCount.get(a.id) ?? 0),
    );
}

/** Products for the hero card */
export async function getHeroProducts(locale: Locale, limit = 5) {
  const catalog = await getStoreCatalog(locale);
  return catalog.slice(0, limit);
}

export const SHOP_PAGE_SIZE = 8;

export function paginateCatalog(
  catalog: IStoreProduct[],
  tab: ShopTab,
  page: number,
) {
  const slug = SHOP_TABS.find((t) => t.key === tab)?.categorySlug ?? null;
  const filtered = slug
    ? catalog.filter((p) => p.categorySlugs.includes(slug))
    : catalog;
  const totalPages = Math.max(1, Math.ceil(filtered.length / SHOP_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * SHOP_PAGE_SIZE;
  return {
    items: filtered.slice(start, start + SHOP_PAGE_SIZE),
    page: current,
    totalPages,
    total: filtered.length,
  };
}

/**
 * Bilingual search over the cached catalog: a product matches when every word of the query
 * appears in its English or Arabic name, notes or category (Arabic letter variants folded,
 * so "قهوه" finds "قهوة"). Results come back in the visitor's language.
 */
export async function searchCatalog(
  locale: Locale,
  query: string,
  limit = 8,
): Promise<IStoreProduct[]> {
  const tokens = normalizeBilingualText(query.slice(0, 80))
    .split(' ')
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const [en, ar] = await Promise.all([
    getStoreCatalog('en'),
    getStoreCatalog('ar'),
  ]);
  const arById = new Map(ar.map((p) => [p.id, p]));
  const results = locale === 'ar' ? ar : en;
  const enById = new Map(en.map((p) => [p.id, p]));

  return results
    .filter((p) => {
      const pair = [enById.get(p.id), arById.get(p.id)];
      const haystack = normalizeBilingualText(
        pair
          .flatMap((x) => (x ? [x.name, x.notes, x.slug, ...x.categorySlugs] : []))
          .join(' ')
          .replace(/-/g, ' '),
      );
      return tokens.every((token) => haystack.includes(token));
    })
    .slice(0, limit);
}

export interface IProductVariantOption {
  label: string;
  /** Exact label the API expects back when adding to the bag */
  value: string;
  /** The price list's Item Number for this size */
  sku: string;
  price: string;
  priceCents: number;
}

export interface IStoreProductDetail extends IStoreProduct {
  sku: string;
  description: string;
  origin: string;
  elevation: string;
  process: string;
  weightGrams: number;
  grinds: string[];
  variants: IProductVariantOption[];
  /** The shop tab this product belongs to (capsules / beans / arabic), for breadcrumbs + related */
  tab: ShopTab;
  stock: number;
  priceCents: number;
  maxPriceCents: number | null;
}

/** One product for its own page, or null when it doesn't exist / isn't for sale */
export async function getStoreProductDetail(
  locale: Locale,
  slug: string,
): Promise<IStoreProductDetail | null> {
  'use cache';
  cacheTag('products', `product:${slug}`);

  const [product, catalog] = await Promise.all([
    fetchServerProductBySlug(slug),
    getStoreCatalog(locale),
  ]);
  if (!product || !product.isActive) {
    cacheLife('seconds');
    return null;
  }
  cacheLife('minutes');

  const base = catalog.find((p) => p.id === product.id);
  const ar = locale === 'ar';
  const price = new Intl.NumberFormat(LOCALE_META[locale].intl, {
    style: 'currency',
    currency: 'EGP',
    maximumFractionDigits: 0,
  });
  const tab =
    SHOP_TABS.find((t) => t.categorySlug && base?.categorySlugs.includes(t.categorySlug))?.key ??
    'all';

  return {
    ...(base ?? {
      id: product.id,
      slug: product.slug,
      name: ar ? product.nameAr || product.name : product.name_en || product.name,
      notes: '',
      roastLevel: product.roastLevel,
      soldCount: product.soldCount ?? 0,
      roastScore: ROAST_SCORE[product.roastLevel] ?? 0,
      price: price.format(product.finalPriceCents / 100),
      hasOptions: (product.variants?.length ?? 0) > 1,
      images: product.imageUrls ?? [],
      hasPhotos: false,
      isFeatured: Boolean(product.isFeatured),
      categorySlugs: [],
      defaultGrind: product.availableGrinds?.[0] ?? 'WHOLE_BEAN',
    }),
    // Product page shows every note from the price list, not just the first three
    notes: notesList(product, locale).join(' · '),
    sku: product.sku,
    description:
      (ar ? product.description_ar : product.description_en) || product.description || '',
    origin: (ar ? product.originCountryAr : null) || product.originCountry || '',
    elevation: (ar ? product.elevationAr : null) || product.elevation || '',
    process: (ar ? product.processingMethodAr : null) || product.processingMethod || '',
    weightGrams: product.weightGrams,
    grinds: product.availableGrinds ?? [],
    variants: (product.variants ?? []).map((v) => ({
      label: (ar ? v.labelAr : null) || v.label,
      value: v.label,
      sku: (v as { sku?: string | null }).sku ?? '',
      price: price.format(v.priceCents / 100),
      priceCents: v.priceCents,
    })),
    tab,
    stock: product.stock,
    priceCents: product.finalPriceCents ?? product.priceCents,
    maxPriceCents: product.maxPriceCents ?? null,
  };
}

/** Everything else of the same type (all of them, not a short list) */
export async function getRelatedProducts(
  locale: Locale,
  product: Pick<IStoreProductDetail, 'id' | 'tab' | 'categorySlugs'>,
): Promise<IStoreProduct[]> {
  const catalog = await getStoreCatalog(locale);
  const slug = SHOP_TABS.find((t) => t.key === product.tab)?.categorySlug;
  return catalog.filter(
    (p) =>
      p.id !== product.id &&
      (slug
        ? p.categorySlugs.includes(slug)
        : p.categorySlugs.some((c) => product.categorySlugs.includes(c))),
  );
}
