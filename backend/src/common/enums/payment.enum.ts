export enum PaymentProvider {
  PAYMOB = 'PAYMOB',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
}

export enum PaymentMethod {
  PAYMOB_CARD = 'PAYMOB_CARD',
  CASH_ON_DELIVERY = 'CASH_ON_DELIVERY',
  CARD = 'CARD',
  MOBILE_WALLET = 'MOBILE_WALLET',
  KIOSK = 'KIOSK',
  CASH = 'CASH',
}

export enum PaymentTypeEnum {
  CASH = 'CASH',
  CARD = 'CARD',
}

export enum CurrencyTypeEnum {
  USD = 'usd',
  EGP = 'egp',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  INITIATED = 'INITIATED',
  SUCCESS = 'SUCCESS',
  AUTHORIZED = 'AUTHORIZED',
  CAPTURED = 'CAPTURED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  VOIDED = 'VOIDED',
}
