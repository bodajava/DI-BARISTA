export type AppLocale = 'en' | 'ar';

export type RoastLevel =
  | 'LIGHT'
  | 'MEDIUM_LIGHT'
  | 'MEDIUM'
  | 'MEDIUM_DARK'
  | 'DARK'
  | 'ESPRESSO'
  | 'ESPRESSO_ROAST';

export type GrindType =
  | 'WHOLE_BEAN'
  | 'ESPRESSO'
  | 'FILTER_V60'
  | 'CHEMEX'
  | 'FRENCH_PRESS'
  | 'AEROPRESS'
  | 'TURKISH'
  | 'COLD_BREW';

export type OrderStatus =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'PLACED'
  | 'PAID'
  | 'CONFIRMED'
  | 'ROASTING'
  | 'ROASTING_AND_PREPARING'
  | 'PACKING'
  | 'PROCESSING'
  | 'PREPARING'
  | 'SHIPPED'
  | 'ON_WAY'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'REFUNDED';

export type TrackStage =
  | 'PENDING'
  | 'ROASTING'
  | 'PACKING'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED';

export type PaymentMethod =
  | 'PAYMOB_CARD'
  | 'MOBILE_WALLET'
  | 'CASH_ON_DELIVERY';

export type PaymentStatus =
  | 'PENDING'
  | 'INITIATED'
  | 'SUCCESS'
  | 'PAID'
  | 'UNPAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

export type CouponDiscountType =
  | 'PERCENTAGE'
  | 'FIXED_AMOUNT'
  | 'FIXED_AMOUNT_CENTS';

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'STAFF' | 'CUSTOMER' | 'BARISTA' | 'USER' | 'GUEST';

export interface IBrandRef {
  _id?: string;
  id?: string;
  name?: string;
  slug?: string;
}

export interface ICategoryRef {
  _id?: string;
  id?: string;
  name?: string;
  nameAr?: string;
  slug?: string;
}

export interface IProductVariant {
  label: string;
  labelAr?: string;
  priceCents: number;
  weightGrams?: number;
  capsulesCount?: number;
  sizeGrams?: number;
  grindType?: GrindType;
  stock?: number;
  sku?: string;
}

export interface IProduct {
  id: string;
  name: string;
  nameAr?: string;
  name_en?: string;
  name_ar?: string;
  slug: string;
  sku: string;
  description?: string;
  description_en?: string;
  description_ar?: string;
  brandId: string | IBrandRef;
  categoryId: string | ICategoryRef;
  categoryIds?: Array<string | ICategoryRef>;
  roastLevel: RoastLevel;
  availableGrinds: GrindType[];
  flavorNotes: string[];
  tastingNotes_en?: string[];
  tastingNotes_ar?: string[];
  originCountry?: string;
  originCountryAr?: string;
  elevation?: string;
  elevationAr?: string;
  processingMethod?: string;
  processingMethodAr?: string;
  weightGrams: number;
  priceCents: number;
  maxPriceCents?: number;
  discountPercent: number;
  finalPriceCents: number;
  variants?: IProductVariant[];
  stock: number;
  soldCount: number;
  viewsCount: number;
  imageUrls: string[];
  status?: 'ACTIVE' | 'DRAFT' | 'OUT_OF_STOCK' | string;
  isFeatured?: boolean;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICartItem {
  itemId: string;
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  selectedGrind: GrindType;
  variantLabel?: string;
  variantLabelAr?: string;
  lineTotalCents: number;
  product?: Partial<IProduct>;
}

export interface ICart {
  id: string;
  guestSessionId: string;
  userId?: string | null;
  items: ICartItem[];
  totalItemsCount: number;
  subTotalCents: number;
  updatedAt?: string;
}

export interface ICoupon {
  _id?: string;
  id?: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderAmountCents: number;
  maxDiscountAmountCents?: number;
  startDate: string;
  endDate: string;
  usageLimit: number;
  usedCount: number;
  allowedEmails?: string[];
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ICouponValidationResult {
  couponId: string;
  code: string;
  discountType: CouponDiscountType;
  discountValue: number;
  discountCents: number;
  finalSubTotalCents: number;
}

export interface ISubscriber {
  id?: string;
  _id?: string;
  email: string;
  locale: string;
  source: string;
  isActive: boolean;
  createdAt?: string;
}

export interface IContactMessage {
  id?: string;
  _id?: string;
  email: string;
  name?: string;
  message: string;
  locale: string;
  status: 'NEW' | 'READ' | 'ARCHIVED';
  createdAt?: string;
}

export interface IInsightBucket {
  _id: string | number | null;
  orders?: number;
  revenueCents?: number;
  units?: number;
  nameAr?: string;
}

export interface IBusinessInsights {
  generatedAt: string;
  today: { orders: number; revenueCents: number };
  yesterday: { orders: number; revenueCents: number };
  last30: { orders: number; revenueCents: number };
  prev30: { orders: number; revenueCents: number };
  byPayment: IInsightBucket[];
  byCity: IInsightBucket[];
  byCategory: IInsightBucket[];
  byHour: IInsightBucket[];
  byWeekday: IInsightBucket[];
  avgUnitsPerOrder: number;
  totalDiscountCents: number;
  couponUsageRate: number;
  customersCount: number;
  repeatCustomerRate: number;
  openFulfilment: number;
  cancellationRate30: number;
  abandonedOnline30: number;
  lowStock: Array<{ _id: string; name: string; nameAr?: string; sku: string; stock: number; slug: string }>;
  subscribersTotal: number;
  subscribers30: number;
  messagesNew: number;
}

export interface IOrderItem {
  productId: string;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  selectedGrind: GrindType;
  lineTotalCents: number;
}

export interface IShippingAddress {
  street: string;
  city: string;
  building: string;
  floor?: string;
  apartment?: string;
  postalCode?: string;
}

export interface IOrder {
  id: string;
  orderNumber: string;
  userId?: string | null;
  guestSessionId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  notes?: string | null;
  subTotalCents: number;
  discountCents: number;
  couponCode?: string | null;
  shippingFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod | string;
  paymentStatus: PaymentStatus | string;
  status: OrderStatus | string;
  paymobOrderId?: number | null;
  intentionId?: string | null;
  handledByStaffId?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ITrackedOrder {
  orderNumber: string;
  customerName: string;
  status: OrderStatus | string;
  normalizedStage: TrackStage | 'CANCELLED' | 'REFUNDED';
  paymentStatus: PaymentStatus | string;
  paymentMethod: PaymentMethod | string;
  items: IOrderItem[];
  subTotalCents: number;
  discountCents: number;
  couponCode?: string | null;
  shippingFeeCents: number;
  totalCents: number;
  shippingAddress: {
    city: string;
    street: string;
    building: string;
  };
  createdAt?: string;
  updatedAt?: string;
}

export interface IOrderPaymentInfo {
  _id?: string;
  id?: string;
  orderReference: string;
  provider: string;
  method: string;
  status: string;
  amountCents: number;
  currency: string;
  paymobOrderId?: number;
  paymobTransactionId?: number;
  paymobIntentionId?: string;
  webhookVerified?: boolean;
  paidAt?: string;
  refundedAt?: string;
  createdAt?: string;
}

export interface IOverviewAnalytics {
  totalRevenueCents: number;
  totalRevenueFormatted: string;
  paidOrdersCount: number;
  totalOrdersCount: number;
  averageOrderValueCents: number;
  averageOrderValueFormatted: string;
  uniqueCustomersCount: number;
  ordersByStatus: Array<{
    status: string;
    count: number;
    totalCents: number;
  }>;
}

export interface IWinnerProductStat {
  _id: string;
  sku: string;
  name: string;
  totalQuantitySold: number;
  totalRevenueCents: number;
  ordersCount: number;
}

export interface ILoserProductStat {
  _id: string;
  name: string;
  nameAr?: string;
  sku: string;
  slug: string;
  roastLevel: string;
  priceCents: number;
  finalPriceCents: number;
  stock: number;
  viewsCount: number;
  soldCount: number;
  dropOffRatio: number;
}

export interface IProductsPerformanceAnalytics {
  winnerProducts: IWinnerProductStat[];
  loserHighDropOffProducts: ILoserProductStat[];
}

export interface ICustomerBuyerStat {
  email: string;
  customerName: string;
  customerPhone: string;
  buyerType: 'REPEAT_BUYER' | 'ONE_TIME_BUYER';
  totalOrdersCount: number;
  totalSpendCents: number;
  totalSpendFormatted: string;
  avgOrderValueCents: number;
  firstOrderDate: string;
  lastOrderDate: string;
}

export interface ICustomersDirectoryAnalytics {
  summary: {
    totalDistinctBuyers: number;
    repeatBuyersCount: number;
    oneTimeBuyersCount: number;
  };
  promoTargetingLists: {
    allBuyerEmails: string[];
    repeatBuyerEmails: string[];
    oneTimeBuyerEmails: string[];
  };
  buyers: ICustomerBuyerStat[];
}

export interface ISalesTrendPoint {
  period: string;
  ordersCount: number;
  revenueCents: number;
  revenueFormatted: string;
  discountCents: number;
}

export interface ISalesTrendAnalytics {
  interval: 'day' | 'week' | 'month';
  series: ISalesTrendPoint[];
}

export interface IPaginationMeta {
  totalDocs: number;
  limit: number;
  page: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface IApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
  meta?: IPaginationMeta;
  error?: string;
}

export interface IAiToolCallTrace {
  id: string;
  name: string;
  status: 'running' | 'done';
  summary: string;
}

export interface IAdminSessionPayload {
  sub: string;
  email: string;
  fullName: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}

export function stripArabicChars(text: string): string {
  return (text || '').replace(/[\u0600-\u06FF\u0750-\u077F]+/g, '').replace(/\s{2,}/g, ' ').trim();
}

const ORIGIN_EN_TO_AR: Record<string, string> = {
  ethiopia: 'إثيوبيا',
  'ethiopia (yirgacheffe)': 'إثيوبيا (يرجاتشيف)',
  colombia: 'كولومبيا',
  'colombia (huila)': 'كولومبيا (ويلا)',
  brazil: 'البرازيل',
  'brazil & ethiopia': 'البرازيل وإثيوبيا',
  'brazil & colombia': 'البرازيل وكولومبيا',
  kenya: 'كينيا',
  guatemala: 'غواتيمالا',
  'costa rica': 'كوستاريكا',
  yemen: 'اليمن',
  indonesia: 'إندونيسيا',
  egypt: 'مصر',
  'egypt / global': 'مصر / عالمي',
  japan: 'اليابان',
  italy: 'إيطاليا',
};

const TASTING_NOTE_EN_TO_AR: Record<string, string> = {
  'dark chocolate': 'شوكولاتة داكنة',
  'milk chocolate': 'شوكولاتة بالحليب',
  chocolate: 'شوكولاتة',
  toffee: 'توفي',
  'brown sugar': 'سكر بني',
  'velvety crema': 'كريمة مخملية',
  caramel: 'كراميل',
  'roasted hazelnut': 'بندق محمص',
  'toasted hazelnut': 'بندق محمص',
  hazelnut: 'بندق',
  'toasted almond': 'لوز محمص',
  'roasted almond': 'لوز محمص',
  almond: 'لوز',
  'red apple': 'تفاح أحمر',
  jasmine: 'ياسمين',
  'jasmine blossom': 'زهر الياسمين',
  bergamot: 'برغموت',
  'white peach': 'خوخ أبيض',
  peach: 'خوخ',
  'lemon zest': 'قشر ليمون',
  honey: 'عسل طبيعي',
  citrus: 'حمضيات',
  vanilla: 'فانيليا',
  cocoa: 'كاكاو',
  berries: 'توت مشكل',
  strawberry: 'فراولة',
  cardamom: 'هيل',
};

function translateTermToArabic(value: string, dict: Record<string, string>): string | null {
  const clean = (value || '').trim();
  if (!clean) return null;
  if (!/[A-Za-z]/.test(clean)) return clean;
  const hit = dict[clean.toLowerCase()];
  return hit || null;
}

export function formatWeightLabel(
  grams: number | undefined | null,
  locale: AppLocale = 'en',
): string {
  const g = grams || 250;
  return locale === 'ar' ? `${g} جم` : `${g}g`;
}

export function formatDisplaySku(
  sku: string | undefined | null,
  locale: AppLocale = 'en',
): string {
  const raw = (sku || '').trim();
  if (!raw) return locale === 'ar' ? '#٠٠١' : 'DBC-001';
  if (locale !== 'ar') return raw;
  const digits = raw.match(/\d+/g)?.join('');
  if (digits) return `#${digits}`;
  const slugHint: Record<string, string> = {
    'DBC-SIG-001': '#٠٠١',
    'DBC-ETH-YIR': '#١٠١',
    'DBC-COL-SUP': '#١٠٢',
    'DBC-SIG-BLD': '#١٠٣',
  };
  if (slugHint[raw]) return slugHint[raw];
  return `#${raw.replace(/[^0-9]/g, '') || '١٠٠'}`;
}

export function formatEgp(
  cents: number | undefined | null,
  locale: AppLocale = 'en',
): string {
  const safe = Number(cents || 0) / 100;
  const formatted = safe.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return locale === 'ar' ? `${formatted} ج.م` : `EGP ${formatted}`;
}

export function formatGrindLabel(
  grind: string,
  locale: AppLocale = 'en',
): string {
  const mapAr: Record<string, string> = {
    WHOLE_BEAN: 'حبوب كاملة',
    ESPRESSO: 'طحن إسبريسو',
    FILTER_V60: 'طحن فلتر V60',
    CHEMEX: 'طحن كيميكس',
    FRENCH_PRESS: 'فرينش برس (خشن)',
    AEROPRESS: 'إيروبرس (متوسط ناعم)',
    TURKISH: 'طحن تركي فائق النعومة',
    COLD_BREW: 'كولد برو (خشن جداً)',
  };
  const mapEn: Record<string, string> = {
    WHOLE_BEAN: 'Whole Bean',
    ESPRESSO: 'Espresso Fine',
    FILTER_V60: 'Filter / V60',
    CHEMEX: 'Chemex Medium-Coarse',
    FRENCH_PRESS: 'French Press Coarse',
    AEROPRESS: 'AeroPress Medium-Fine',
    TURKISH: 'Turkish Micro-Fine',
    COLD_BREW: 'Cold Brew Extra-Coarse',
  };
  if (locale === 'ar') {
    return mapAr[grind] || grind;
  }
  return (
    mapEn[grind] ||
    grind
      .split('_')
      .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
      .join(' ')
  );
}

export function formatRoastLabel(
  roast: string,
  locale: AppLocale = 'en',
): string {
  const mapAr: Record<string, string> = {
    LIGHT: 'تحميص فاتح',
    MEDIUM_LIGHT: 'تحميص متوسط فاتح',
    MEDIUM: 'تحميص متوسط',
    MEDIUM_DARK: 'تحميص متوسط داكن',
    DARK: 'تحميص داكن',
    ESPRESSO: 'تحميص إسبريسو',
    ESPRESSO_ROAST: 'تحميص إسبريسو',
  };
  const mapEn: Record<string, string> = {
    LIGHT: 'Light Roast',
    MEDIUM_LIGHT: 'Medium-Light Roast',
    MEDIUM: 'Medium Roast',
    MEDIUM_DARK: 'Medium-Dark Roast',
    DARK: 'Dark Roast',
    ESPRESSO: 'Espresso Roast',
    ESPRESSO_ROAST: 'Espresso Roast',
  };
  return locale === 'ar'
    ? mapAr[roast] || roast
    : mapEn[roast] || formatGrindLabel(roast, 'en');
}

export function isBrewingGearProduct(product: Partial<IProduct>): boolean {
  const cat =
    product.categoryId && typeof product.categoryId === 'object'
      ? (product.categoryId as ICategoryRef)
      : null;
  if (cat?.slug === 'brewing-gear') return true;
  if (Array.isArray(product.categoryIds)) {
    for (const entry of product.categoryIds) {
      if (
        entry &&
        typeof entry === 'object' &&
        (entry as ICategoryRef).slug === 'brewing-gear'
      ) {
        return true;
      }
    }
  }
  return Boolean(product.sku?.startsWith('DBC-GEAR'));
}

export function getLocalizedProduct(
  product: Partial<IProduct>,
  locale: AppLocale,
) {
  const categoryObj =
    product.categoryId && typeof product.categoryId === 'object'
      ? (product.categoryId as ICategoryRef)
      : null;

  if (locale === 'ar') {
    const name =
      (product.name_ar && !/[A-Za-z]/.test(product.name_ar)
        ? product.name_ar
        : product.nameAr) ||
      product.name_ar ||
      'منتج قهوة مختصة';
    const description =
      product.description_ar ||
      'محصول قهوة مختصة محمص بعناية فائقة لإبراز نقاء النكهات وتوازن القوام.';

    const rawNotes = product.tastingNotes_ar?.length
      ? product.tastingNotes_ar
      : (product.flavorNotes || [])
          .map((n) => translateTermToArabic(n, TASTING_NOTE_EN_TO_AR))
          .filter((v): v is string => Boolean(v));

    const tastingNotes = rawNotes
      .map((n) => translateTermToArabic(n, TASTING_NOTE_EN_TO_AR) || n)
      .filter((n) => !/[A-Za-z]{3,}/.test(n));

    const translatedOrigin =
      (product.originCountryAr && !/[A-Za-z]{3,}/.test(product.originCountryAr)
        ? product.originCountryAr
        : null) ||
      translateTermToArabic(product.originCountry || '', ORIGIN_EN_TO_AR) ||
      'مختارة من ديباريستا';

    const rawElevation = product.elevationAr || product.elevation || '';
    const elevation =
      rawElevation && !/[A-Za-z]{3,}/.test(rawElevation)
        ? rawElevation
        : rawElevation
          ? rawElevation.replace(/MASL/gi, 'متر فوق سطح البحر')
          : '١٥٠٠ – ١٩٥٠ متر';

    const rawProcess = product.processingMethodAr || product.processingMethod || '';
    const processingMethod =
      rawProcess && !/[A-Za-z]{3,}/.test(rawProcess)
        ? rawProcess
        : 'تحميص حرفي على دفعات صغيرة';

    const rawCategory = categoryObj?.nameAr || categoryObj?.name || '';
    const categoryName =
      rawCategory && !/[A-Za-z]{3,}/.test(rawCategory)
        ? rawCategory
        : 'قهوة مختصة';

    return {
      name,
      description,
      tastingNotes,
      origin: translatedOrigin,
      elevation,
      processingMethod,
      categoryName,
      roastLabel: formatRoastLabel(product.roastLevel || 'MEDIUM', 'ar'),
    };
  }

  const cleanName = stripArabicChars(product.name_en || product.name || '') || 'Specialty Roastery Lot';
  const cleanDescription =
    stripArabicChars(product.description_en || product.description || '') ||
    'Artisanal small-batch roastery release calibrated for expressive sweetness and clean structure.';
  const cleanNotes = (product.tastingNotes_en?.length
    ? product.tastingNotes_en
    : product.flavorNotes || []
  )
    .map((n) => stripArabicChars(n))
    .filter(Boolean);
  const cleanOrigin =
    stripArabicChars(product.originCountry || '') || 'Roaster Selection';
  const cleanElevation =
    stripArabicChars(product.elevation || '') || '1,400 – 1,950 MASL';
  const cleanProcess =
    stripArabicChars(product.processingMethod || '') || 'Small-Batch Drum Roast';
  const cleanCategory =
    stripArabicChars(categoryObj?.name || '') || 'Specialty Coffee';

  return {
    name: cleanName,
    description: cleanDescription,
    tastingNotes: cleanNotes,
    origin: cleanOrigin,
    elevation: cleanElevation,
    processingMethod: cleanProcess,
    categoryName: cleanCategory,
    roastLabel: formatRoastLabel(product.roastLevel || 'MEDIUM', 'en'),
  };
}

export function normalizeOrderStage(
  status: string,
): TrackStage | 'CANCELLED' | 'REFUNDED' {
  const s = (status || '').toUpperCase().trim();
  if (s === 'CANCELLED') return 'CANCELLED';
  if (s === 'REFUNDED') return 'REFUNDED';
  if (s === 'DELIVERED') return 'DELIVERED';
  if (s === 'OUT_FOR_DELIVERY' || s === 'SHIPPED' || s === 'ON_WAY') {
    return 'OUT_FOR_DELIVERY';
  }
  if (s === 'PACKING' || s === 'PROCESSING' || s === 'PREPARING') return 'PACKING';
  if (
    s === 'ROASTING' ||
    s === 'ROASTING_AND_PREPARING' ||
    s === 'CONFIRMED' ||
    s === 'PAID'
  ) {
    return 'ROASTING';
  }
  return 'PENDING';
}

export function resolveCatalogImage(product?: Partial<IProduct>): string {
  const firstUrl = product?.imageUrls?.[0];
  if (typeof firstUrl === 'string' && firstUrl.startsWith('/images/')) {
    return firstUrl;
  }
  return '/images/catalog/house-espresso-blend.svg';
}
