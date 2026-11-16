export interface ISearchableCoffeeProduct {
  id?: string;
  _id?: string;
  name: string;
  nameAr?: string;
  slug?: string;
  sku?: string;
  description?: string;
  originCountry?: string;
  roastLevel?: string;
  flavorNotes?: string[];
  availableGrinds?: string[];
  priceCents?: number;
  finalPriceCents?: number;
  weightGrams?: number;
  stock?: number;
  imageUrls?: string[];
}

/**
 * Normalize English and Arabic coffee queries/fields:
 * - Lowercases Latin text
 * - Strips Arabic diacritics (tashkeel) and tatweel
 * - Normalizes Alef variants (أ/إ/آ/ٱ -> ا), Alef Maksura (ى -> ي), and Teh Marbuta (ة -> ه)
 */
export function normalizeBilingualText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[\u0640\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks whether all query tokens appear across a coffee product's searchable bilingual fields.
 */
export function matchesBilingualCoffeeQuery(
  product: ISearchableCoffeeProduct,
  query: string,
): boolean {
  const normalizedQuery = normalizeBilingualText(query);
  if (!normalizedQuery) return true;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (tokens.length === 0) return true;

  const haystack = normalizeBilingualText(
    [
      product.name,
      product.nameAr ?? '',
      product.slug ?? '',
      product.sku ?? '',
      product.originCountry ?? '',
      product.roastLevel ?? '',
      product.description ?? '',
      ...(product.flavorNotes ?? []),
      ...(product.availableGrinds ?? []),
    ].join(' '),
  );

  return tokens.every(
    (token) =>
      haystack.includes(token) ||
      (token.length >= 4 &&
        token.endsWith('ه') &&
        haystack.includes(token.slice(0, -1))),
  );
}
