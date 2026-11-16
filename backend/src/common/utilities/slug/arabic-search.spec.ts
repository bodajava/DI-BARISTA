import {
  ISearchableCoffeeProduct,
  matchesBilingualCoffeeQuery,
  normalizeBilingualText,
} from '../../../../../frontend/src/lib/arabic-search';

describe('Storefront Bilingual Arabic/English Instant Search Engine', () => {
  const sampleCatalog: ISearchableCoffeeProduct[] = [
    {
      id: 'prod_1',
      name: 'Ethiopian Yirgacheffe Kochere',
      nameAr: 'حبوب بن إثيوبي يرجاتشيف مختص',
      slug: 'ethiopian-yirgacheffe-kochere',
      sku: 'DIB-ETH-250',
      originCountry: 'Ethiopia',
      roastLevel: 'LIGHT',
      flavorNotes: ['Jasmine', 'Bergamot', 'ياسمين', 'خوخ'],
      availableGrinds: ['WHOLE_BEAN', 'FILTER_V60'],
      priceCents: 45000,
      finalPriceCents: 45000,
      weightGrams: 250,
      stock: 40,
      imageUrls: ['https://example.com/eth.jpg'],
    },
  ];

  it('normalizes Arabic Alef variants (أ/إ/آ -> ا), Alef Maqsura (ى -> ي), Teh Marbuta (ة -> ه), and Tashkeel', () => {
    expect(normalizeBilingualText('إِثْيُوبِيّ مُخْتَصَّةٌ هُدَى')).toBe(
      'اثيوبي مختصه هدي',
    );
  });

  it('matches Arabic queries regardless of Hamza/Ta-Marbuta variations and English terms', () => {
    expect(matchesBilingualCoffeeQuery(sampleCatalog[0], 'اثيوبي مختصة')).toBe(
      true,
    );
    expect(matchesBilingualCoffeeQuery(sampleCatalog[0], 'أثيوبي مختصه')).toBe(
      true,
    );
    expect(matchesBilingualCoffeeQuery(sampleCatalog[0], 'yirgacheffe jasmine')).toBe(
      true,
    );
    expect(matchesBilingualCoffeeQuery(sampleCatalog[0], 'colombian dark')).toBe(
      false,
    );
  });
});

