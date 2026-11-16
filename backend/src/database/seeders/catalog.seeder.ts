import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Types } from 'mongoose';
import { GrindType, RoastLevel } from '../../common/enums';
import { SlugUtil } from '../../common/utilities/slug';
import {
  BrandRepository,
  CategoryRepository,
  ProductRepository,
} from '../../models/repositories';
import {
  ProductPublishStatus,
  ProductVariant,
} from '../../models/schemas/product.schema';

interface ISeedCategoryDef {
  slug: string;
  name: string;
  nameAr: string;
  description: string;
}

interface ISeedProductDef {
  sku: string;
  name: string;
  nameAr: string;
  description: string;
  descriptionAr?: string;
  categorySlugs: string[];
  minPrice: number;
  maxPrice: number;
  status: ProductPublishStatus;
  isFeatured: boolean;
  roastLevel: RoastLevel;
  originCountry: string;
  originCountryAr?: string;
  elevation?: string;
  elevationAr?: string;
  processingMethod?: string;
  processingMethodAr?: string;
  flavorNotes: string[];
  tastingNotesAr?: string[];
  availableGrinds: GrindType[];
  weightGrams?: number;
  isCapsule?: boolean;
  isGear?: boolean;
  imageUrls?: string[];
  customVariants?: ProductVariant[];
}

const ARABIC_ORIGIN_MAP: Record<string, string> = {
  'Italy Blend': 'توليفة إيطالية',
  'Single Origin Selection': 'محصول مختار أحادي المصدر',
  'Ethiopia / Single Origin': 'إثيوبيا / أحادي المصدر',
  'Colombia / Single Origin': 'كولومبيا / أحادي المصدر',
  'Yemen & Ethiopia Style': 'توليفة يمنية وإثيوبية تقليدية',
  'Levantine & Arabian Blend': 'توليفة شامية وعربية أصيلة',
  'Arabian Heritage Blend': 'توليفة عربية تراثية',
  'Brazil & India Blend': 'توليفة البرازيل والهند',
  'Colombia & Brazil Blend': 'توليفة كولومبيا والبرازيل',
  'Brazil Rio Minas': 'البرازيل (ريو ميناس)',
  'Brazil': 'البرازيل',
  'Brazil & Chios Mastika': 'البرازيل مع مستكة خيوس اليونانية',
  'Ethiopia (Kaffa Tega)': 'إثيوبيا (كافا تيجا)',
  'Ethiopia (Bench Maji)': 'إثيوبيا (بنش ماجي)',
  'Nicaragua (Nueva Segovia)': 'نيكاراغوا (نويفا سيغوفيا)',
  'Ethiopia & Costa Rica': 'إثيوبيا وكوستاريكا',
  'Guatemala (Antigua / Huehuetenango)': 'غواتيمالا (أنتيغوا / هيوهويتينانغو)',
  'Ethiopia (Chaka Estate)': 'إثيوبيا (مزرعة شاكا)',
  'Colombia (Huila)': 'كولومبيا (ويلا)',
  'Brazil (Santos)': 'البرازيل (سانتوس)',
  'Multi-Origin Assortment': 'تشكيلة محاصيل متعددة المصادر',
};

const ARABIC_NOTE_MAP: Record<string, string> = {
  'Dark Chocolate': 'شوكولاتة داكنة',
  'Toasted Hazelnut': 'بندق محمص',
  'Roasted Hazelnut': 'بندق محمص',
  'Rich Crema': 'كريما غنية',
  Caramel: 'كراميل',
  'Sweet Orange': 'برتقال حلو',
  Floral: 'نوتات زهرية',
  'Milk Chocolate': 'شوكولاتة بالحليب',
  'Roasted Almond': 'لوز محمص',
  'Toasted Almond': 'لوز محمص',
  'Smooth Body': 'قوام ناعم',
  'Wild Berry': 'توت بري',
  'Sweet Cocoa': 'كاكاو حلو',
  Jasmine: 'ياسمين',
  'Brown Sugar': 'سكر بني',
  'Warm Spice': 'توابل دافئة',
  Toffee: 'توفي',
  Apricot: 'مشمش',
  Honey: 'عسل',
  Vanilla: 'فانيليا',
  'Dark Cocoa': 'كاكاو داكن',
  Hazelnut: 'بندق',
  Molasses: 'دبس السكر',
  Praline: 'برالين',
  Nutmeg: 'جوزة الطيب',
  'Green Cardamom': 'هيل أخضر',
  'Saffron Spice': 'زعفران وتوابل',
  'Roasted Nuts': 'مكسرات محمصة',
  'Chios Mastika': 'مستكة خيوس',
  Cardamom: 'هيل فاخر',
  'Floral Honey': 'عسل زهري',
  'Golden Malt': 'شعير ذهبي',
  'Smooth Finish': 'نهاية ناعمة',
  'Roasted Walnut': 'جوز محمص',
  'Hazelnut Praline': 'برالين البندق',
  'Cocoa Nibs': 'حبيبات الكاكاو',
  'Sweet Cream': 'كريمة حلوة',
  'Bakers Chocolate': 'شوكولاتة داكنة فاخرة',
  'Toasted Pecan': 'بيكان محمص',
  'Full Body': 'قوام ممتلئ',
  Mastika: 'مستكة طبيعية',
  Bergamot: 'برغموت',
  'White Peach': 'خوخ أبيض',
  'Orange Blossom': 'زهر البرتقال',
  Mango: 'مانجو',
  'Earl Grey Tea': 'شاي إيرل جراي',
  'Red Apple': 'تفاح أحمر',
  'Cane Sugar': 'سكر القصب',
  Honeycomb: 'قرص العسل',
  Mandarin: 'يوسفي',
  Butterscotch: 'باترسكوتش',
  Lychee: 'ليتشي',
  Panela: 'بانيلا (سكر قصب طبيعي)',
  'Red Plum': 'برقوق أحمر',
  'Sweet Nougat': 'نوغا حلوة',
  Almond: 'لوز',
  'Creamy Finish': 'نهاية كريمية',
  'Assorted Tasting Pack': 'تشكيلة نكهات متنوعة',
  Chocolate: 'شوكولاتة',
  'Floral & Nutty': 'زهري ومكسرات',
};

function buildArabicDescription(item: ISeedProductDef): string {
  if (item.descriptionAr) return item.descriptionAr;
  const originAr = ARABIC_ORIGIN_MAP[item.originCountry] || item.originCountry;
  const notesAr = (item.flavorNotes || []).map(
    (n) => ARABIC_NOTE_MAP[n] || n,
  );
  const notesLine = notesAr.join('، ');
  if (item.isCapsule) {
    return `${item.nameAr} — كبسولات قهوة مختصة محكمة الإغلاق بالنيتروجين من ${originAr}، تتميز بإيحاءات ${notesLine} وكريما غنية متوازنة.`;
  }
  if (item.categorySlugs.includes('turkish-arabic-coffee')) {
    return `${item.nameAr} — مطحونة بعناية فائقة على الطريقة التراثية من أجود حبوب الأرابيكا مع إيحاءات ${notesLine} وقوام مخملي أصيل.`;
  }
  return `${item.nameAr} — محمصة على دفعات صغيرة من ${originAr} لإبراز إيحاءات ${notesLine} وصفاء النكهة في كل كوب.`;
}

/**
 * Real pack shots (4 angles each, transparent webp) served by the storefront from
 * frontend/public/products/<sku>/. Products missing here still use the illustrated placeholders.
 */
const PRODUCT_PHOTO_COUNTS: Record<string, number> = {
  'DBC-WC-001': 4, // Roma capsules bag
  'DBC-WC-002': 4, // Florence capsules bag
  'DBC-WC-003': 4, // Milan capsules (10)
  'DBC-WC-004': 3, // Verona capsules (10)
  'DBC-WC-005': 4, // Venice capsules (10)
  'DBC-WC-006': 4, // Florence capsules (10)
  'DBC-WC-007': 4, // Roma capsules (10)
  'DBC-WC-008': 4, // Venice decaf capsules bag
  'DBC-WC-009': 4, // Oriental Arabic coffee with cardamom
  'DBC-WC-012': 4, // Torino espresso beans
  'DBC-WC-013': 4, // Arezzo espresso beans
  'DBC-WC-015': 4, // Afandi Turkish coffee
  'DBC-WC-021': 4, // Guatemala beans
  'DBC-WC-022': 4, // Gesha Ethiopian Chaka beans
  'DBC-WC-023': 4, // Colombia Huila beans
  'DBC-WC-025': 4, // Milan capsules bag
  'DBC-WC-026': 4, // Mix capsules bag
};

export function productPhotosForSku(sku: string): string[] {
  const count = PRODUCT_PHOTO_COUNTS[sku] ?? 0;
  const folder = sku.toLowerCase();
  return Array.from({ length: count }, (_, i) => `/products/${folder}/${i + 1}.webp`);
}

const PLACEHOLDER_IMAGE_PREFIX = '/images/catalog/';

function defaultImageForSeed(item: ISeedProductDef): string[] {
  if (item.imageUrls?.length) return item.imageUrls;
  const photos = productPhotosForSku(item.sku);
  if (photos.length) return photos;
  if (item.isCapsule) return ['/images/catalog/roastery-capsules.svg'];
  if (item.categorySlugs.includes('turkish-arabic-coffee')) {
    return ['/images/catalog/turkish-arabic-coffee.svg'];
  }
  if (item.originCountry.toLowerCase().includes('ethiopia')) {
    return ['/images/catalog/ethiopia-yirgacheffe.svg'];
  }
  if (item.originCountry.toLowerCase().includes('colombia')) {
    return ['/images/catalog/colombia-pink-bourbon.svg'];
  }
  return ['/images/catalog/house-espresso-blend.svg'];
}

const WOOCOMMERCE_CATEGORIES: ISeedCategoryDef[] = [
  {
    slug: 'coffee-capsules',
    name: 'Coffee Capsules',
    nameAr: 'كبسولات القهوة',
    description:
      'Nespresso-compatible specialty coffee capsules freshly roasted and nitrogen-sealed for rich crema.',
  },
  {
    slug: 'coffee-capsules-mix-blend',
    name: 'Coffee Capsules Mix Blend',
    nameAr: 'كبسولات بلند مشكل',
    description:
      'Signature Italian-style multi-origin espresso capsule blends with balanced body and sweetness.',
  },
  {
    slug: 'single-origin',
    name: 'Single Origin',
    nameAr: 'أحادية المصدر',
    description:
      'Traceable single-origin coffees showcasing distinct regional terroir and tasting notes.',
  },
  {
    slug: 'turkish-arabic-coffee',
    name: 'Turkish & Arabic Coffee',
    nameAr: 'قهوة تركي وعربي',
    description:
      'Authentic finely ground Turkish and Oriental Arabic coffees roasted with premium green cardamom and mastika.',
  },
  {
    slug: 'coffee-beans',
    name: 'Coffee Beans',
    nameAr: 'حبوب القهوة',
    description:
      'Freshly roasted whole coffee beans and custom-ground blends for espresso and filter brewing.',
  },
  {
    slug: 'coffee-beans-mix-blend',
    name: 'Coffee Beans Mix Blend',
    nameAr: 'حبوب قهوة بلند',
    description:
      'Master-roasted espresso and house coffee bean blends engineered for velvety crema and milk harmony.',
  },
  {
    slug: 'specialty-coffee',
    name: 'Specialty Coffee',
    nameAr: 'قهوة مختصة',
    description:
      '86+ SCA grade micro-lot specialty coffee beans sourced from Ethiopia, Colombia, Guatemala, Nicaragua, and Brazil.',
  },
  {
    slug: 'brewing-gear',
    name: 'Brewing Gear',
    nameAr: 'معدات التحضير',
    description:
      'Precision porcelain drippers, variable-temperature gooseneck kettles, and barista tools calibrated for clean manual extraction.',
  },
];

const WOOCOMMERCE_PRODUCTS: ISeedProductDef[] = [
  {
    sku: 'DBC-WC-001',
    name: 'Roma Coffee Capsules Bag',
    nameAr: 'حقيبة كبسولات قهوة روما (بلند مشكل)',
    description:
      'Full-bodied Roma espresso capsule bag crafted from a signature Arabica-Robusta mix blend with dark chocolate and toasted hazelnut notes.',
    categorySlugs: ['coffee-capsules', 'coffee-capsules-mix-blend'],
    minPrice: 7.99,
    maxPrice: 63.99,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.MEDIUM_DARK,
    originCountry: 'Italy Blend',
    flavorNotes: ['Dark Chocolate', 'Toasted Hazelnut', 'Rich Crema'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-002',
    name: 'Florence Coffee Capsules Bag',
    nameAr: 'حقيبة كبسولات قهوة فلورنسا (أحادية المصدر)',
    description:
      'Single-origin Florence coffee capsules pouch offering floral aromatics, sweet citrus acidity, and a silky caramel finish.',
    categorySlugs: ['coffee-capsules', 'single-origin'],
    minPrice: 8.99,
    maxPrice: 76.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Single Origin Selection',
    flavorNotes: ['Caramel', 'Sweet Orange', 'Floral'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-003',
    name: 'Milan Coffee Capsules',
    nameAr: 'كبسولات قهوة ميلانو (بلند مشكل)',
    description:
      'Velvety Milan mix-blend coffee capsules delivering a smooth Northern Italian espresso profile with cocoa and almond sweetness.',
    categorySlugs: ['coffee-capsules', 'coffee-capsules-mix-blend'],
    minPrice: 15.5,
    maxPrice: 136.5,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Italy Blend',
    flavorNotes: ['Milk Chocolate', 'Roasted Almond', 'Smooth Body'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-004',
    name: 'Verona Coffee Capsules',
    nameAr: 'كبسولات قهوة فيرونا (أحادية المصدر)',
    description:
      'Premium single-origin Verona coffee capsules featuring bright berry undertones and a lingering sweet cocoa aftertaste.',
    categorySlugs: ['coffee-capsules', 'single-origin'],
    minPrice: 17.99,
    maxPrice: 161.99,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Ethiopia / Single Origin',
    flavorNotes: ['Wild Berry', 'Sweet Cocoa', 'Jasmine'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-005',
    name: 'Venice Coffee Capsules',
    nameAr: 'كبسولات قهوة فينيسيا (أحادية المصدر)',
    description:
      'Refined single-origin Venice espresso capsules with medium-dark caramelization, warm spice, and syrupy mouthfeel.',
    categorySlugs: ['coffee-capsules', 'single-origin'],
    minPrice: 17.99,
    maxPrice: 161.99,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM_DARK,
    originCountry: 'Colombia / Single Origin',
    flavorNotes: ['Brown Sugar', 'Warm Spice', 'Toffee'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-006',
    name: 'Florence Coffee Capsules',
    nameAr: 'كبسولات قهوة فلورنسا الفاخرة',
    description:
      'Boxed Florence single-origin coffee capsules roasted for aromatic complexity, stone-fruit sweetness, and golden crema.',
    categorySlugs: ['coffee-capsules', 'single-origin'],
    minPrice: 17.99,
    maxPrice: 161.99,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Single Origin Selection',
    flavorNotes: ['Apricot', 'Honey', 'Vanilla'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-007',
    name: 'Roma Coffee Capsules',
    nameAr: 'كبسولات قهوة روما الكلاسيكية',
    description:
      'Classic Roman espresso mix-blend capsules with bold intensity, dark cocoa depth, and dense hazelnut crema.',
    categorySlugs: ['coffee-capsules', 'coffee-capsules-mix-blend'],
    minPrice: 15.5,
    maxPrice: 136.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.DARK,
    originCountry: 'Italy Blend',
    flavorNotes: ['Dark Cocoa', 'Hazelnut', 'Molasses'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-008',
    name: 'Venice Coffee Capsules Bag',
    nameAr: 'حقيبة كبسولات قهوة فينيسيا (أحادية المصدر)',
    description:
      'Value pouch of Venice single-origin coffee capsules delivering balanced sweetness, nutty warmth, and velvety texture.',
    categorySlugs: ['coffee-capsules', 'single-origin'],
    minPrice: 8.99,
    maxPrice: 76.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM_DARK,
    originCountry: 'Single Origin Selection',
    flavorNotes: ['Praline', 'Caramel', 'Nutmeg'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-009',
    name: 'Oriental Arabic Coffee With Cardamom',
    nameAr: 'قهوة عربية شرقية بالهيل الفاخر',
    description:
      'Traditional Oriental Arabic coffee finely ground from 100% premium Arabica beans blended with aromatic green Guatemala cardamom.',
    categorySlugs: ['turkish-arabic-coffee'],
    minPrice: 19.75,
    maxPrice: 59.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.LIGHT,
    originCountry: 'Yemen & Ethiopia Style',
    flavorNotes: ['Green Cardamom', 'Saffron Spice', 'Roasted Nuts'],
    availableGrinds: [GrindType.TURKISH],
  },
  {
    sku: 'DBC-WC-010',
    name: 'Oriental Arabic Coffee With Cardamom & Mastika',
    nameAr: 'قهوة عربية شرقية بالهيل والمستكة',
    description:
      'Royal Oriental Arabic coffee infused with natural Chios mastika and freshly crushed green cardamom pods.',
    categorySlugs: ['turkish-arabic-coffee'],
    minPrice: 29.75,
    maxPrice: 96.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.LIGHT,
    originCountry: 'Levantine & Arabian Blend',
    flavorNotes: ['Chios Mastika', 'Cardamom', 'Floral Honey'],
    availableGrinds: [GrindType.TURKISH],
  },
  {
    sku: 'DBC-WC-011',
    name: 'Oriental Arabic Coffee',
    nameAr: 'قهوة عربية شرقية سادة',
    description:
      'Pure, unspiced Oriental Arabic coffee roasted to a golden-medium profile for an authentic, smooth heritage cup.',
    categorySlugs: ['turkish-arabic-coffee'],
    minPrice: 15.99,
    maxPrice: 54.0,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM_LIGHT,
    originCountry: 'Arabian Heritage Blend',
    flavorNotes: ['Golden Malt', 'Toasted Almond', 'Smooth Finish'],
    availableGrinds: [GrindType.TURKISH],
  },
  {
    sku: 'DBC-WC-012',
    name: 'Torino Espresso Roasted Coffee Beans',
    nameAr: 'حبوب قهوة تورينو المحمصة للإسبريسو (بلند)',
    description:
      'Torino signature espresso blend roasted in small batches for syrupy body, persistent tiger-stripe crema, and chocolate-caramel balance.',
    categorySlugs: ['coffee-beans', 'coffee-beans-mix-blend'],
    minPrice: 26.5,
    maxPrice: 86.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM_DARK,
    originCountry: 'Brazil & India Blend',
    flavorNotes: ['Dark Chocolate', 'Caramel', 'Roasted Walnut'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.ESPRESSO,
      GrindType.FRENCH_PRESS,
    ],
  },
  {
    sku: 'DBC-WC-013',
    name: 'Arezzo Espresso Roasted Coffee Beans',
    nameAr: 'حبوب قهوة أريتزو المحمصة للإسبريسو (بلند)',
    description:
      'Tuscan-inspired Arezzo espresso bean blend combining washed Central American Arabicas for bright aromatics and velvety milk drinks.',
    categorySlugs: ['coffee-beans', 'coffee-beans-mix-blend'],
    minPrice: 28.5,
    maxPrice: 92.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM_DARK,
    originCountry: 'Colombia & Brazil Blend',
    flavorNotes: ['Hazelnut Praline', 'Cocoa Nibs', 'Sweet Cream'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.ESPRESSO,
      GrindType.FILTER_V60,
    ],
  },
  {
    sku: 'DBC-WC-014',
    name: 'Afandi Turkish Coffee with Cardamom',
    nameAr: 'قهوة أفندي تركية بالهيل',
    description:
      'Stone-milled extra-fine Afandi Turkish coffee blended with freshly ground aromatic green cardamom for a thick, velvety kaimak crema foam.',
    categorySlugs: ['turkish-arabic-coffee'],
    minPrice: 15.0,
    maxPrice: 49.5,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Brazil Rio Minas',
    flavorNotes: ['Cardamom', 'Dark Cocoa', 'Roasted Hazelnut'],
    availableGrinds: [GrindType.TURKISH],
  },
  {
    sku: 'DBC-WC-015',
    name: 'Afandi Turkish Coffee',
    nameAr: 'قهوة أفندي تركية سادة',
    description:
      'Classic plain Afandi Turkish coffee stone-ground to silky powder from selected Brazilian Arabica beans.',
    categorySlugs: ['turkish-arabic-coffee'],
    minPrice: 14.0,
    maxPrice: 45.0,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Brazil',
    flavorNotes: ['Bakers Chocolate', 'Toasted Pecan', 'Full Body'],
    availableGrinds: [GrindType.TURKISH],
  },
  {
    sku: 'DBC-WC-016',
    name: 'Afandi Turkish Coffee With Cardamom & Mastika',
    nameAr: 'قهوة أفندي تركية بالهيل والمستكة',
    description:
      'Artisanal Afandi Turkish coffee enriched with authentic Greek mastika tears and fragrant green cardamom.',
    categorySlugs: ['turkish-arabic-coffee'],
    minPrice: 20.0,
    maxPrice: 54.0,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Brazil & Chios Mastika',
    flavorNotes: ['Mastika', 'Green Cardamom', 'Sweet Cocoa'],
    availableGrinds: [GrindType.TURKISH],
  },
  {
    sku: 'DBC-WC-017',
    name: 'Verona Ethiopian Kaffa Tega specialty Coffee Beans',
    nameAr: 'حبوب قهوة مختصة فيرونا إثيوبيا كافا تيجا',
    description:
      'Wild forest heirloom Arabica from the Kaffa Biosphere Reserve in Ethiopia, bursting with bergamot, jasmine, and peach sweetness.',
    categorySlugs: ['specialty-coffee', 'coffee-beans', 'single-origin'],
    minPrice: 13.5,
    maxPrice: 39.5,
    status: 'DRAFT',
    isFeatured: false,
    roastLevel: RoastLevel.LIGHT,
    originCountry: 'Ethiopia (Kaffa Tega)',
    flavorNotes: ['Bergamot', 'Jasmine', 'White Peach'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.CHEMEX,
      GrindType.AEROPRESS,
    ],
  },
  {
    sku: 'DBC-WC-018',
    name: 'Ethiopian Gesha Specialty Coffee Beans',
    nameAr: 'حبوب قهوة مختصة إثيوبيا جيشا',
    description:
      'Rare high-elevation Ethiopian Gesha micro-lot with delicate tea-like body, orange blossom aromatics, and tropical mango notes.',
    categorySlugs: ['specialty-coffee', 'coffee-beans', 'single-origin'],
    minPrice: 17.5,
    maxPrice: 54.5,
    status: 'DRAFT',
    isFeatured: false,
    roastLevel: RoastLevel.LIGHT,
    originCountry: 'Ethiopia (Bench Maji)',
    flavorNotes: ['Orange Blossom', 'Mango', 'Earl Grey Tea'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.CHEMEX,
    ],
  },
  {
    sku: 'DBC-WC-019',
    name: 'Nicaragua Buenos Aires Specialty Coffee',
    nameAr: 'قهوة مختصة نيكاراغوا بوينس آيرس',
    description:
      'Single-estate Finca Buenos Aires Maragogype/Caturra from Dipilto, Nicaragua with crisp red apple acidity and milk chocolate sweetness.',
    categorySlugs: ['specialty-coffee', 'coffee-beans', 'single-origin'],
    minPrice: 19.5,
    maxPrice: 56.5,
    status: 'DRAFT',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM_LIGHT,
    originCountry: 'Nicaragua (Nueva Segovia)',
    flavorNotes: ['Red Apple', 'Milk Chocolate', 'Cane Sugar'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.ESPRESSO,
      GrindType.FRENCH_PRESS,
    ],
  },
  {
    sku: 'DBC-WC-020',
    name: 'Florence Specialty Coffee Beans',
    nameAr: 'حبوب قهوة مختصة فلورنسا (بلند مختص)',
    description:
      'Specialty-grade omni-roast blend pairing washed Ethiopian and honey-processed Costa Rican beans for filter and modern espresso.',
    categorySlugs: [
      'specialty-coffee',
      'coffee-beans',
      'coffee-beans-mix-blend',
    ],
    minPrice: 13.5,
    maxPrice: 39.5,
    status: 'DRAFT',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Ethiopia & Costa Rica',
    flavorNotes: ['Honeycomb', 'Mandarin', 'Milk Chocolate'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.ESPRESSO,
      GrindType.FILTER_V60,
    ],
  },
  {
    sku: 'DBC-WC-021',
    name: 'Guatemala AA SHB Specialty Coffee',
    nameAr: 'قهوة غواتيمالا المختصة عالية الصلابة',
    description:
      'Strictly Hard Bean (SHB) volcanic-soil Guatemalan coffee grown above 1,600m with rich cocoa body, sweet orange, and butterscotch finish.',
    categorySlugs: ['specialty-coffee', 'coffee-beans', 'single-origin'],
    minPrice: 19.9,
    maxPrice: 34.95,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Guatemala (Antigua / Huehuetenango)',
    flavorNotes: ['Butterscotch', 'Sweet Orange', 'Dark Cocoa'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.ESPRESSO,
      GrindType.FRENCH_PRESS,
    ],
  },
  {
    sku: 'DBC-WC-022',
    name: 'GESHA Ethiopian Chaka Specialty Coffee Beans',
    nameAr: 'حبوب قهوة مختصة جيشا إثيوبيا شاكا',
    description:
      'Chaka Estate Gesha specialty coffee beans from Ethiopia, celebrated for vibrant jasmine florals, lychee sweetness, and silky clarity.',
    categorySlugs: ['specialty-coffee', 'coffee-beans', 'single-origin'],
    minPrice: 29.0,
    maxPrice: 49.0,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.LIGHT,
    originCountry: 'Ethiopia (Chaka Estate)',
    flavorNotes: ['Jasmine', 'Lychee', 'Bergamot', 'Honey'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.CHEMEX,
      GrindType.AEROPRESS,
    ],
  },
  {
    sku: 'DBC-WC-023',
    name: 'Colombia Coffee Huila Specialty Coffee Beans',
    nameAr: 'حبوب قهوة مختصة كولومبيا ويلا',
    description:
      'Hand-harvested Colombian Huila specialty Arabica delivering juicy caramel sweetness, panela brown sugar, and bright red plum notes.',
    categorySlugs: ['specialty-coffee', 'coffee-beans', 'single-origin'],
    minPrice: 29.0,
    maxPrice: 49.0,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Colombia (Huila)',
    flavorNotes: ['Panela', 'Caramel', 'Red Plum', 'Milk Chocolate'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.ESPRESSO,
      GrindType.FRENCH_PRESS,
    ],
  },
  {
    sku: 'DBC-WC-024',
    name: 'Brazil Santos Specialty Coffee',
    nameAr: 'قهوة مختصة البرازيل سانتوس',
    description:
      'Natural-processed Brazil Santos NY2 specialty beans with low acidity, creamy peanut-chocolate body, and sweet hazelnut finish.',
    categorySlugs: ['specialty-coffee', 'coffee-beans', 'single-origin'],
    minPrice: 12.5,
    maxPrice: 37.5,
    status: 'DRAFT',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM_DARK,
    originCountry: 'Brazil (Santos)',
    flavorNotes: ['Roasted Hazelnut', 'Milk Chocolate', 'Sweet Nougat'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.ESPRESSO,
      GrindType.FRENCH_PRESS,
      GrindType.COLD_BREW,
    ],
  },
  {
    sku: 'DBC-WC-025',
    name: 'Milan Coffee Capsules Bag',
    nameAr: 'حقيبة كبسولات قهوة ميلانو (بلند مشكل)',
    description:
      'Convenient Milan mix-blend coffee capsules bag crafted for smooth daily espresso and cappuccino lovers.',
    categorySlugs: ['coffee-capsules', 'coffee-capsules-mix-blend'],
    minPrice: 7.99,
    maxPrice: 63.99,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Italy Blend',
    flavorNotes: ['Sweet Cocoa', 'Almond', 'Creamy Finish'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-WC-026',
    name: 'Mix Coffee Capsules Bag',
    nameAr: 'حقيبة كبسولات قهوة مشكلة (تشكيلة ديباريستا)',
    description:
      'Assorted DIBARESTA coffee capsules tasting bag combining Roma, Milan, Florence, and Venice profiles in one discovery pack.',
    categorySlugs: ['coffee-capsules', 'coffee-capsules-mix-blend'],
    minPrice: 8.5,
    maxPrice: 72.25,
    status: 'ACTIVE',
    isFeatured: false,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Multi-Origin Assortment',
    flavorNotes: ['Assorted Tasting Pack', 'Chocolate', 'Floral & Nutty'],
    availableGrinds: [GrindType.ESPRESSO],
    isCapsule: true,
  },
  {
    sku: 'DBC-SIG-001',
    name: 'Ethiopia Yirgacheffe Washed',
    nameAr: 'إثيوبيا يرجاتشيف المغسولة',
    description:
      'High-altitude Worka Chelbessa washed heirloom lot from Yirgacheffe, Ethiopia. Delivers sparkling bergamot tea clarity, jasmine aromatics, and juicy white peach sweetness.',
    descriptionAr:
      'محصول إثيوبي فاخر من مرتفعات يرجاتشيف (معالجة مغسولة تقليدية على أسرة التجفيف). يجمع بين إيحاءات البرغموت وزهر الياسمين وحلاوة الخوخ الأبيض مع قوام شاي صافٍ.',
    categorySlugs: ['single-origin', 'specialty-coffee', 'coffee-beans'],
    minPrice: 480,
    maxPrice: 1650,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.LIGHT,
    originCountry: 'Ethiopia (Yirgacheffe)',
    originCountryAr: 'إثيوبيا (يرجاتشيف)',
    elevation: '1,950 – 2,150 MASL',
    elevationAr: '١٩٥٠ – ٢١٥٠ متر فوق سطح البحر',
    processingMethod: 'Fully Washed · Raised-Bed Dried',
    processingMethodAr: 'معالجة مغسولة · تجفيف شمسي على أسرة مرتفعة',
    flavorNotes: ['Bergamot', 'Jasmine Blossom', 'White Peach', 'Honey'],
    tastingNotesAr: ['برغموت', 'زهر الياسمين', 'خوخ أبيض', 'عسل طبيعي'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.CHEMEX,
      GrindType.AEROPRESS,
    ],
    imageUrls: ['/images/catalog/ethiopia-yirgacheffe.svg'],
  },
  {
    sku: 'DBC-SIG-002',
    name: 'Colombia Huila Pink Bourbon',
    nameAr: 'كولومبيا ويلا بينك بوربون',
    description:
      'Rare Pink Bourbon varietal harvested at Finca El Mirador in Huila, Colombia. Undergoes 36-hour anaerobic cherry fermentation for vibrant blood orange, hibiscus, and cane-sugar silkiness.',
    descriptionAr:
      'سلالة بينك بوربون النادرة من مزرعة إل ميرادور في ويلا، كولومبيا. معالجة لاهوائية مغسولة لمدة ٣٦ ساعة تمنح كوباً مشرقاً بإيحاءات البرتقال الدموي والكركديه وكراميل قصب السكر.',
    categorySlugs: ['single-origin', 'specialty-coffee', 'coffee-beans'],
    minPrice: 540,
    maxPrice: 1850,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.MEDIUM_LIGHT,
    originCountry: 'Colombia (Huila)',
    originCountryAr: 'كولومبيا (ويلا)',
    elevation: '1,800 – 1,950 MASL',
    elevationAr: '١٨٠٠ – ١٩٥٠ متر فوق سطح البحر',
    processingMethod: 'Washed Anaerobic (36h)',
    processingMethodAr: 'مغسولة بتخمير لاهوائي (٣٦ ساعة)',
    flavorNotes: ['Blood Orange', 'Hibiscus', 'Panela Caramel', 'Red Currant'],
    tastingNotesAr: ['برتقال دموي', 'كركديه', 'كراميل بانيلا', 'كشمش أحمر'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.FILTER_V60,
      GrindType.ESPRESSO,
      GrindType.AEROPRESS,
    ],
    imageUrls: ['/images/catalog/colombia-pink-bourbon.svg'],
  },
  {
    sku: 'DBC-SIG-003',
    name: 'DIBARESTA House Espresso Blend',
    nameAr: 'ديباريستا هاوس إسبريسو بلند',
    description:
      'Our flagship roastery espresso foundation uniting sun-dried Mogiana Brazil lots with washed Colombian sweetness for dense tiger-stripe crema, 70% dark cacao depth, and hazelnut praline structure.',
    descriptionAr:
      'توليفة محمصة ديباريستا الرئيسية للإسبريسو؛ تمزج بين حبوب البرازيل المجففة شمسياً وحبوب كولومبيا المغسولة لتقديم كريما كثيفة، شوكولاتة داكنة ٧٠٪، وبرالين البندق المحمص.',
    categorySlugs: ['coffee-beans-mix-blend', 'coffee-beans'],
    minPrice: 440,
    maxPrice: 1520,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.MEDIUM_DARK,
    originCountry: 'Brazil & Colombia Blend',
    originCountryAr: 'توليفة البرازيل وكولومبيا',
    elevation: '1,250 – 1,650 MASL',
    elevationAr: '١٢٥٠ – ١٦٥٠ متر فوق سطح البحر',
    processingMethod: 'Natural & Washed Roastery Blend',
    processingMethodAr: 'توليفة معالجة مجففة ومغسولة',
    flavorNotes: ['Dark Cacao 70%', 'Roasted Hazelnut', 'Molasses Crema', 'Brown Butter'],
    tastingNotesAr: ['كاكاو داكن ٧٠٪', 'بندق محمص', 'كريما دبس السكر', 'زبدة محمصة'],
    availableGrinds: [
      GrindType.WHOLE_BEAN,
      GrindType.ESPRESSO,
      GrindType.FRENCH_PRESS,
      GrindType.COLD_BREW,
    ],
    imageUrls: ['/images/catalog/house-espresso-blend.svg'],
  },
  {
    sku: 'DBC-GEAR-001',
    name: 'V60 Ceramic Dripper',
    nameAr: 'أداة تقطير سيراميك V60',
    description:
      'Hand-glazed Arita ceramic V60 Size 02 pour-over cone engineered with spiral interior ribs for laminar airflow and even thermal stability during light-roast filter extraction.',
    descriptionAr:
      'أداة تقطير V60 مقاس 02 مصنوعة من بورسلين أريتا عالي الحرارة مع أضلاع داخلية حلزونية لضمان انسياب الهواء وثبات الحرارة أثناء تحضير القهوة المختصة.',
    categorySlugs: ['brewing-gear'],
    minPrice: 890,
    maxPrice: 1150,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'Arita Porcelain Studio',
    originCountryAr: 'خزف أريتا الياباني',
    elevation: '60° Conical Geometry · Size 02',
    elevationAr: 'زاوية مخروطية ٦٠° · مقاس ٠٢',
    processingMethod: 'High-Fire Matte Ceramic · Spiral Ribs',
    processingMethodAr: 'بورسلين مطفي عالي الحرارة · أضلاع حلزونية',
    flavorNotes: ['Thermal Stability', 'Spiral Ribs', '1–4 Cups Capacity', 'Matte Porcelain'],
    tastingNotesAr: ['ثبات حراري ممتاز', 'أضلاع حلزونية', 'سعة ١–٤ أكواب', 'بورسلين مطفي'],
    availableGrinds: [],
    weightGrams: 340,
    isGear: true,
    imageUrls: ['/images/catalog/v60-ceramic-dripper.svg'],
    customVariants: [
      {
        label: 'Size 02 Ceramic Dripper',
        labelAr: 'أداة تقطير سيراميك مقاس 02',
        weightGrams: 340,
        priceCents: 89000,
      },
      {
        label: 'Size 02 + 100 Unbleached Filters',
        labelAr: 'أداة مقاس 02 + 100 فلتر ورقي',
        weightGrams: 460,
        priceCents: 115000,
      },
    ],
  },
  {
    sku: 'DBC-GEAR-002',
    name: 'Precision Gooseneck Kettle',
    nameAr: 'غلاية ترشيح دقيقة بعنق إوزة',
    description:
      '900ml architectural matte-black 304 stainless steel pouring kettle with surgical gooseneck flow control, counterbalanced handle, and 1°C PID variable temperature stability.',
    descriptionAr:
      'غلاية ترشيح سعة ٩٠٠ مل من الستانلس ستيل ٣٠٤ باللون الأسود المطفي، مزودة بعنق إوزة دقيق للتحكم بانسياب الماء ونظام تحكم حراري ذكي بدقة درجة مئوية واحدة.',
    categorySlugs: ['brewing-gear'],
    minPrice: 2850,
    maxPrice: 4600,
    status: 'ACTIVE',
    isFeatured: true,
    roastLevel: RoastLevel.MEDIUM,
    originCountry: 'DIBARESTA Atelier Spec',
    originCountryAr: 'تصميم محمصة ديباريستا',
    elevation: '900 ml Capacity · ±1°C Control',
    elevationAr: 'سعة ٩٠٠ مل · دقة ±١°م',
    processingMethod: '304 Stainless Steel · PID Hold Base',
    processingMethodAr: 'ستانلس ستيل ٣٠٤ · قاعدة تثبيت حراري رقمية',
    flavorNotes: ['900ml Flow Spout', 'PID Temp Hold 40–100°C', 'Integrated Stopwatch', 'Matte Black 304 Steel'],
    tastingNotesAr: ['فوهة صب دقيقة ٩٠٠ مل', 'تثبيت حراري ٤٠–١٠٠°م', 'مؤقت استخلاص مدمج', 'فولاذ ٣٠٤ أسود مطفي'],
    availableGrinds: [],
    weightGrams: 920,
    isGear: true,
    imageUrls: ['/images/catalog/gooseneck-kettle.svg'],
    customVariants: [
      {
        label: 'Stovetop Analog Thermometer (900ml)',
        labelAr: 'إصدار الموقد بمقياس حرارة (٩٠٠ مل)',
        weightGrams: 780,
        priceCents: 285000,
      },
      {
        label: 'Electric PID Variable Temp (900ml)',
        labelAr: 'إصدار كهربائي ذكي بالتثبيت الحراري (٩٠٠ مل)',
        weightGrams: 920,
        priceCents: 460000,
      },
    ],
  },
];

@Injectable()
export class CatalogSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(CatalogSeeder.name);

  constructor(
    private readonly brandRepository: BrandRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly productRepository: ProductRepository,
  ) {}

  /**
   * Default: only inserts catalog entries that don't exist yet, so prices, stock, photos and
   * deletions made in the admin dashboard survive restarts/deploys.
   * Set CATALOG_SEED_MODE=sync to force-overwrite products from the code, or =off to skip.
   */
  async onApplicationBootstrap(): Promise<void> {
    const mode = (process.env.CATALOG_SEED_MODE || 'insert-missing').toLowerCase();
    if (mode === 'off') return;
    await this.seedWooCommerceCatalog(mode === 'sync');
  }

  /**
   * Idempotent Upsert Seeder for the 7 WooCommerce Categories & 26 Production Coffee Products
   */
  async seedWooCommerceCatalog(overwriteExisting = false): Promise<void> {
    const writeOp = overwriteExisting ? '$set' : '$setOnInsert';
    try {
      this.logger.log(
        'Synchronizing DIBARESTA CAFFE WooCommerce catalog (7 Categories & 26 Products)...',
      );

      // 1. Upsert Default DIBARESTA Brand
      let brand = await this.brandRepository.findBySlug('dibaresta-roasters');
      if (!brand) {
        brand = await this.brandRepository.create({
          name: 'DIBARESTA Roasters',
          nameAr: 'محمصة ديباريستا المختصة',
          slug: 'dibaresta-roasters',
          description:
            'Artisanal specialty coffee roasters offering capsules, Turkish & Oriental Arabic coffee, and 86+ SCA micro-lot beans.',
          originCountry: 'UAE / Egypt / Global',
          isActive: true,
        });
      }

      // 2. Upsert All 7 WooCommerce Categories
      const categoryMap = new Map<string, Types.ObjectId>();

      for (const catDef of WOOCOMMERCE_CATEGORIES) {
        const upsertedCategory = await this.categoryRepository.findOneAndUpdate(
          // Match soft-deleted rows too (the repository otherwise adds deletedAt: null),
          // so a category deleted in the dashboard is left alone instead of re-inserted
          { slug: catDef.slug, deletedAt: { $not: { $type: 'string' } } },
          {
            [writeOp]: {
              name: catDef.name,
              nameAr: catDef.nameAr,
              slug: catDef.slug,
              description: catDef.description,
              isActive: true,
              deletedAt: null,
            },
          },
          { upsert: true, new: true },
        );

        if (upsertedCategory) {
          categoryMap.set(catDef.slug, upsertedCategory._id);
        }
      }

      // 3. Upsert All 26 WooCommerce Products with Price Ranges in Cents & Variants
      let upsertedCount = 0;

      for (const item of WOOCOMMERCE_PRODUCTS) {
        const slug = SlugUtil.generate(item.name);
        const minPriceCents = Math.round(item.minPrice * 100);
        const maxPriceCents = Math.round(item.maxPrice * 100);
        const midPriceCents = Math.round((minPriceCents + maxPriceCents) / 2);

        const resolvedCategoryIds = item.categorySlugs
          .map((catSlug) => categoryMap.get(catSlug))
          .filter((id): id is Types.ObjectId => Boolean(id));

        const primaryCategoryId =
          resolvedCategoryIds[0] ||
          Array.from(categoryMap.values())[0];

        const variants: ProductVariant[] = item.customVariants?.length
          ? item.customVariants
          : item.isCapsule
            ? [
                {
                  label: '10 Capsules Pack',
                  labelAr: 'عبوة 10 كبسولات',
                  capsulesCount: 10,
                  priceCents: minPriceCents,
                },
                {
                  label: '50 Capsules Value Pack',
                  labelAr: 'عبوة توفير 50 كبسولة',
                  capsulesCount: 50,
                  priceCents: midPriceCents,
                },
                {
                  label: '100 Capsules Bulk Box',
                  labelAr: 'صندوق 100 كبسولة',
                  capsulesCount: 100,
                  priceCents: maxPriceCents,
                },
              ]
            : [
                {
                  label: '250g Bag',
                  labelAr: 'عبوة 250 جرام',
                  weightGrams: 250,
                  priceCents: minPriceCents,
                },
                {
                  label: '500g Bag',
                  labelAr: 'عبوة 500 جرام',
                  weightGrams: 500,
                  priceCents: midPriceCents,
                },
                {
                  label: '1000g (1kg) Roaster Bag',
                  labelAr: 'عبوة 1 كيلو جرام',
                  weightGrams: 1000,
                  priceCents: maxPriceCents,
                },
              ];

        const isActive = item.status === 'ACTIVE';
        const descriptionAr = buildArabicDescription(item);
        const tastingNotesAr = item.tastingNotesAr?.length
          ? item.tastingNotesAr
          : item.flavorNotes.map((n) => ARABIC_NOTE_MAP[n] || n);
        const originCountryAr =
          item.originCountryAr ||
          ARABIC_ORIGIN_MAP[item.originCountry] ||
          item.originCountry;
        const elevation =
          item.elevation ||
          (item.isCapsule
            ? '800 – 1,500 MASL Blend'
            : '1,400 – 1,950 MASL');
        const elevationAr =
          item.elevationAr ||
          (item.isCapsule
            ? '٨٠٠ – ١٥٠٠ متر فوق سطح البحر'
            : '١٤٠٠ – ١٩٥٠ متر فوق سطح البحر');
        const processingMethod =
          item.processingMethod ||
          (item.isCapsule
            ? 'Nitrogen-Sealed Aluminum Extraction'
            : item.categorySlugs.includes('turkish-arabic-coffee')
              ? 'Stone-Milled Micro-Powder'
              : 'Small-Batch Drum Roast');
        const processingMethodAr =
          item.processingMethodAr ||
          (item.isCapsule
            ? 'تغليف نيتروجين محكم للألمنيوم'
            : item.categorySlugs.includes('turkish-arabic-coffee')
              ? 'طحن حجري ناعم جداً'
              : 'تحميص إسطواني على دفعات صغيرة');

        const existingDoc = await this.productRepository.findBySlug(slug);
        // Keep images uploaded from the dashboard; only swap out the illustrated placeholders
        const onlyPlaceholders = (existingDoc?.imageUrls ?? []).every((url) =>
          url.startsWith(PLACEHOLDER_IMAGE_PREFIX),
        );
        const resolvedImageUrls =
          existingDoc?.imageUrls?.length && !onlyPlaceholders
            ? existingDoc.imageUrls
            : defaultImageForSeed(item);

        await this.productRepository.findOneAndUpdate(
          { slug, deletedAt: { $not: { $type: 'string' } } },
          {
            [writeOp]: {
              name: item.name,
              nameAr: item.nameAr,
              name_en: item.name,
              name_ar: item.nameAr,
              slug,
              sku: item.sku,
              description: item.description,
              description_en: item.description,
              description_ar: descriptionAr,
              brandId: brand._id,
              categoryId: primaryCategoryId,
              categoryIds: resolvedCategoryIds,
              roastLevel: item.roastLevel,
              availableGrinds: item.availableGrinds,
              flavorNotes: item.flavorNotes,
              tastingNotes_en: item.flavorNotes,
              tastingNotes_ar: tastingNotesAr,
              originCountry: item.originCountry,
              originCountryAr,
              elevation,
              elevationAr,
              processingMethod,
              processingMethodAr,
              weightGrams: item.weightGrams ?? 250,
              priceCents: minPriceCents,
              maxPriceCents,
              discountPercent: 0,
              finalPriceCents: minPriceCents,
              variants,
              imageUrls: resolvedImageUrls,
              status: item.status,
              isFeatured: item.isFeatured,
              isActive,
              deletedAt: null,
              ...(overwriteExisting ? {} : { stock: 100, soldCount: 0, viewsCount: 0 }),
            },
            ...(overwriteExisting
              ? { $setOnInsert: { stock: 100, soldCount: 0, viewsCount: 0 } }
              : {}),
          },
          { upsert: true, new: true },
        );

        // Insert-only mode never touches existing rows, so back-fill real photos explicitly
        // (only where the row still shows placeholder art).
        const photos = productPhotosForSku(item.sku);
        if (!overwriteExisting && existingDoc && onlyPlaceholders && photos.length) {
          await this.productRepository.findOneAndUpdate(
            { _id: existingDoc._id },
            { $set: { imageUrls: photos } },
          );
        }

        upsertedCount++;
      }

      this.logger.log(
        `WooCommerce catalog synchronized: ${categoryMap.size} categories and ${upsertedCount} products upserted.`,
      );
    } catch (error) {
      this.logger.warn(
        `Catalog seeder skipped or deferred: ${(error as Error).message}`,
      );
    }
  }
}
