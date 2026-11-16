import { LOCALE_META, type Locale } from '@/lib/i18n';

/**
 * Flat delivery fee shown in the bag. Mirrors OrderService.DEFAULT_SHIPPING_FEE_CENTS in the
 * API (src/modules/order/order.service.ts); the API is still the source of truth at checkout.
 */
export const SHIPPING_FEE_CENTS = 5000;

const formatters = new Map<Locale, Intl.NumberFormat>();

export function formatMoney(cents: number, locale: Locale): string {
  let f = formatters.get(locale);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE_META[locale].intl, {
      style: 'currency',
      currency: 'EGP',
      maximumFractionDigits: 0,
    });
    formatters.set(locale, f);
  }
  return f.format(cents / 100);
}
