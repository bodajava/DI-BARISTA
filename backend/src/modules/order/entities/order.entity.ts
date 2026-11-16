import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../../common/enums';
import { OrderItem, OrderShippingAddress } from '../../../models/schemas';

export class OrderEntity {
  id: string;
  orderNumber: string;
  userId?: string | null;
  guestSessionId?: string | null;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  shippingAddress: OrderShippingAddress;
  notes?: string | null;
  subTotalCents: number;
  discountCents: number;
  couponCode?: string | null;
  shippingFeeCents: number;
  totalCents: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  paymobOrderId?: number | null;
  intentionId?: string | null;
  handledByStaffId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(partial: Partial<OrderEntity>) {
    Object.assign(this, partial);
  }
}
