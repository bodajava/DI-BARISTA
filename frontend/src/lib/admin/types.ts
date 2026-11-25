export type OrderStatus =
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "PREPARING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "REFUNDED";
export type PaymentStatus = "UNPAID" | "PENDING" | "PAID" | "FAILED" | "REFUNDED" | "PARTIALLY_REFUNDED";
export type PaymentMethod = "CASH_ON_DELIVERY" | "PAYMOB_CARD" | "MOBILE_WALLET";
export type Role = "STAFF" | "ADMIN" | "SUPER_ADMIN";

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface OrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  nameAr?: string | null;
  imageUrl?: string | null;
  variantLabel?: string | null;
  variantLabelAr?: string | null;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface Address {
  governorate?: string | null;
  city: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  postalCode?: string;
  notes?: string | null;
}

export interface HistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  by: { id: string; fullName: string } | null;
  createdAt: string;
}

export interface PaymentAttempt {
  id: string;
  provider: string;
  method: PaymentMethod;
  status: PaymentStatus;
  amountCents: number;
  refundedCents: number;
  failureReason?: string | null;
  paymobTransactionId?: number | null;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  userId?: string | null;
  hasAccount?: boolean;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  itemsCount?: number;
  shippingAddress: Address;
  notes?: string | null;
  subTotalCents: number;
  discountCents: number;
  couponCode?: string | null;
  shippingFeeCents: number;
  giftCardCode?: string | null;
  giftCardCents?: number;
  loyaltyPoints?: number;
  loyaltyCents?: number;
  totalCents: number;
  refundedCents?: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  cancelReason?: string | null;
  refundReason?: string | null;
  history?: HistoryEntry[];
  payments?: PaymentAttempt[];
  nextStatuses?: OrderStatus[];
  canRefund?: boolean;
  createdAt: string;
}

export interface Ref {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
}

export interface Variant {
  id: string;
  label: string;
  labelAr?: string | null;
  sku?: string | null;
  priceCents: number;
  regularPriceCents: number;
  salePriceCents?: number | null;
  stock?: number | null;
  weightGrams?: number | null;
  capsulesCount?: number | null;
  isActive: boolean;
  position: number;
}

export interface Product {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  sku: string;
  shortDescription?: string | null;
  shortDescriptionAr?: string | null;
  description?: string | null;
  description_ar?: string | null;
  brandId: Ref | string | null;
  categoryId: Ref | string;
  priceCents: number;
  finalPriceCents: number;
  salePriceCents?: number | null;
  discountPercent: number;
  costCents?: number | null;
  stock: number;
  lowStockThreshold?: number;
  soldCount: number;
  viewsCount: number;
  imageUrls: string[];
  variants?: Variant[];
  isFeatured?: boolean;
  isActive: boolean;
  isDeleted?: boolean;
  createdAt?: string;
}

export interface Category {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  description?: string | null;
  descriptionAr?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  isActive: boolean;
  productCount?: number;
}

export interface Brand {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  description?: string | null;
  originCountry?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  productCount?: number;
}

export interface Coupon {
  id: string;
  code: string;
  note?: string | null;
  discountType: "PERCENTAGE" | "FIXED_AMOUNT";
  discountValue: number;
  minOrderAmountCents: number;
  maxDiscountAmountCents?: number | null;
  startDate: string;
  endDate: string;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  usedCount: number;
  isActive: boolean;
  source?: string;
  state: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "OFF" | "USED_UP";
}

export interface GiftCard {
  id: string;
  code: string | null;
  initialCents: number;
  balanceCents: number;
  source: "ISSUED" | "PURCHASED";
  status: "PENDING_PAYMENT" | "ACTIVE" | "DISABLED";
  recipientEmail?: string | null;
  message?: string | null;
  expiresAt?: string | null;
  createdAt: string;
}

export interface Message {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  locale: string;
  status: "NEW" | "READ" | "REPLIED";
  readAt?: string | null;
  repliedAt?: string | null;
  createdAt: string;
}

export interface Zone {
  id: string;
  governorate: string;
  nameEn: string;
  nameAr: string;
  feeCents: number;
  days: string;
  isActive: boolean;
}

export interface SettingRow {
  key: string;
  type: "string" | "email" | "url" | "int" | "money" | "bool" | "json";
  isPublic: boolean;
  value: unknown;
  min?: number;
  max?: number;
}
