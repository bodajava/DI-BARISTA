export enum PaymentProvider {
  PAYMOB = 'PAYMOB',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}

export enum RoastLevel {
  LIGHT = 'LIGHT',
  MEDIUM_LIGHT = 'MEDIUM_LIGHT',
  MEDIUM = 'MEDIUM',
  MEDIUM_DARK = 'MEDIUM_DARK',
  DARK = 'DARK',
  ESPRESSO = 'ESPRESSO',
}

export const ONLINE_PAYMENT_METHODS = ['PAYMOB_CARD', 'MOBILE_WALLET'] as const;
