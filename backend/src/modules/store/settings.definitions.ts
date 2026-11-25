/**
 * Every store setting: its type, default, and whether the storefront may read it.
 * Values live in the `settings` table (key → JSON); missing keys fall back to the default.
 */
export type SettingType = 'string' | 'email' | 'url' | 'int' | 'money' | 'bool' | 'json';

export interface SettingDefinition {
  type: SettingType;
  default: unknown;
  isPublic: boolean;
  min?: number;
  max?: number;
}

export interface MarqueeConfig {
  enabled: boolean;
  lines: Array<{ en: string; ar: string }>;
}

export interface WheelSlice {
  labelEn: string;
  labelAr: string;
  /** none | percent | amount */
  prize: 'none' | 'percent' | 'amount';
  /** % for percent, piasters for amount */
  value: number;
  weight: number;
}

export interface WheelConfig {
  enabled: boolean;
  startsAt: string | null;
  endsAt: string | null;
  popupDelaySeconds: number;
  codeValidityDays: number;
  minOrderCents: number;
  slices: WheelSlice[];
  /** email → slice index; that email always lands on that slice */
  chosenWinners: Array<{ email: string; sliceIndex: number }>;
  round: number;
}

export const DEFAULT_WHEEL: WheelConfig = {
  enabled: false,
  startsAt: null,
  endsAt: null,
  popupDelaySeconds: 8,
  codeValidityDays: 7,
  minOrderCents: 0,
  slices: [
    { labelEn: '10% off', labelAr: 'خصم ١٠٪', prize: 'percent', value: 10, weight: 30 },
    { labelEn: 'Try again', labelAr: 'حظ أوفر', prize: 'none', value: 0, weight: 40 },
    { labelEn: '50 EGP off', labelAr: 'خصم ٥٠ ج.م', prize: 'amount', value: 5000, weight: 20 },
    { labelEn: '20% off', labelAr: 'خصم ٢٠٪', prize: 'percent', value: 20, weight: 10 },
  ],
  chosenWinners: [],
  round: 1,
};

export const SETTINGS: Record<string, SettingDefinition> = {
  'store.name': { type: 'string', default: 'DI BARISTA', isPublic: true },
  'contact.email': { type: 'email', default: '', isPublic: true },
  'contact.phone': { type: 'string', default: '', isPublic: true },
  'contact.whatsapp': { type: 'string', default: '', isPublic: true },
  'social.instagram': { type: 'url', default: '', isPublic: true },
  'contact.backupEmail': { type: 'email', default: '', isPublic: false },
  'orders.inboxEmail': { type: 'email', default: '', isPublic: false },
  currency: { type: 'string', default: 'EGP', isPublic: true },
  'shipping.freeThresholdCents': { type: 'money', default: 0, isPublic: true, min: 0 },
  'shipping.defaultFeeCents': { type: 'money', default: 5000, isPublic: true, min: 0 },
  'reviews.autoPublish': { type: 'bool', default: false, isPublic: false },
  'loyalty.pointValueCents': { type: 'money', default: 10, isPublic: true, min: 0 },
  'loyalty.spendPerPointCents': { type: 'money', default: 1000, isPublic: true, min: 1 },
  'referral.bonusPoints': { type: 'int', default: 100, isPublic: true, min: 0 },
  'cart.abandonedReminderHours': { type: 'int', default: 24, isPublic: false, min: 1, max: 720 },
  'orders.unpaidExpiryMinutes': { type: 'int', default: 30, isPublic: false, min: 5, max: 10080 },
  'giftCards.unpaidExpiryMinutes': { type: 'int', default: 60, isPublic: false, min: 5, max: 10080 },
  'marquee.top': {
    type: 'json',
    default: { enabled: true, lines: [{ en: 'Free delivery on orders over 1,000 EGP', ar: 'توصيل مجاني للطلبات فوق ١٠٠٠ ج.م' }] },
    isPublic: true,
  },
  'marquee.band': {
    type: 'json',
    default: { enabled: true, lines: [{ en: 'Roasted in small batches', ar: 'محمّصة على دفعات صغيرة' }] },
    isPublic: true,
  },
  wheel: { type: 'json', default: DEFAULT_WHEEL, isPublic: false },
};
