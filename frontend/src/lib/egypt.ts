/** Egypt's 27 governorates; the English name is what gets stored on the order */
export const GOVERNORATES: Array<{ en: string; ar: string }> = [
  { en: 'Cairo', ar: 'القاهرة' },
  { en: 'Giza', ar: 'الجيزة' },
  { en: 'Alexandria', ar: 'الإسكندرية' },
  { en: 'Qalyubia', ar: 'القليوبية' },
  { en: 'Dakahlia', ar: 'الدقهلية' },
  { en: 'Sharqia', ar: 'الشرقية' },
  { en: 'Gharbia', ar: 'الغربية' },
  { en: 'Monufia', ar: 'المنوفية' },
  { en: 'Beheira', ar: 'البحيرة' },
  { en: 'Kafr El Sheikh', ar: 'كفر الشيخ' },
  { en: 'Damietta', ar: 'دمياط' },
  { en: 'Port Said', ar: 'بورسعيد' },
  { en: 'Ismailia', ar: 'الإسماعيلية' },
  { en: 'Suez', ar: 'السويس' },
  { en: 'Faiyum', ar: 'الفيوم' },
  { en: 'Beni Suef', ar: 'بني سويف' },
  { en: 'Minya', ar: 'المنيا' },
  { en: 'Asyut', ar: 'أسيوط' },
  { en: 'Sohag', ar: 'سوهاج' },
  { en: 'Qena', ar: 'قنا' },
  { en: 'Luxor', ar: 'الأقصر' },
  { en: 'Aswan', ar: 'أسوان' },
  { en: 'Red Sea', ar: 'البحر الأحمر' },
  { en: 'New Valley', ar: 'الوادي الجديد' },
  { en: 'Matrouh', ar: 'مطروح' },
  { en: 'North Sinai', ar: 'شمال سيناء' },
  { en: 'South Sinai', ar: 'جنوب سيناء' },
];

/** Egyptian mobile: 010/011/012/015 + 8 digits, with or without +20 / 0020 */
export function normalizeEgyptPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '').replace(/^(\+20|0020)/, '0');
  return /^01[0125]\d{8}$/.test(digits) ? digits : null;
}

export type PaymentMethodKey = 'CASH_ON_DELIVERY' | 'PAYMOB_CARD' | 'MOBILE_WALLET';

/**
 * Payment methods offered at checkout. Mobile wallets need a Paymob wallet integration
 * (PAYMOB_INTEGRATION_ID_WALLET in the API), so they are opt-in:
 * NEXT_PUBLIC_PAYMENT_METHODS=CASH_ON_DELIVERY,PAYMOB_CARD,MOBILE_WALLET
 */
export function enabledPaymentMethods(): PaymentMethodKey[] {
  // Online first (pre-selected), cash last, like most Egyptian checkouts
  const all: PaymentMethodKey[] = ['PAYMOB_CARD', 'MOBILE_WALLET', 'CASH_ON_DELIVERY'];
  const configured = (process.env.NEXT_PUBLIC_PAYMENT_METHODS || 'CASH_ON_DELIVERY,PAYMOB_CARD')
    .split(',')
    .map((m) => m.trim().toUpperCase());
  const enabled = all.filter((m) => configured.includes(m));
  return enabled.length ? enabled : ['CASH_ON_DELIVERY'];
}
