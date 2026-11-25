import { OrderStatus, PaymentMethod, PaymentStatus } from '../../../common/enums';

export interface OrderItemView {
  id: string;
  productId: string | null;
  variantId: string | null;
  sku: string;
  name: string;
  nameAr?: string | null;
  imageUrl?: string | null;
  variantLabel?: string | null;
  variantLabelAr?: string | null;
  selectedGrind: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderAddressView {
  governorate?: string | null;
  city: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  postalCode: string;
}

export interface OrderHistoryView {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  note: string | null;
  by: { id: string; fullName: string } | null;
  createdAt: Date;
}

export class OrderEntity {
  id: string;
  orderNumber: string;
  userId?: string | null;
  hasAccount?: boolean;
  guestSessionId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItemView[];
  itemsCount?: number;
  shippingAddress: OrderAddressView;
  notes?: string | null;
  locale?: string;
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
  paymobOrderId?: number | null;
  intentionId?: string | null;
  handledByStaffId?: string | null;
  history?: OrderHistoryView[];
  payments?: unknown[];
  nextStatuses?: OrderStatus[];
  canRefund?: boolean;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(partial: Partial<OrderEntity>) {
    Object.assign(this, partial);
  }
}
