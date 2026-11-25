// Database enums come from Prisma so the TypeScript types and the PostgreSQL types never drift
export { OrderStatus, PaymentStatus, PaymentMethod, CouponDiscountType } from '@prisma/client';
import { OrderStatus } from '@prisma/client';

export enum GrindType {
  WHOLE_BEAN = 'WHOLE_BEAN',
  ESPRESSO = 'ESPRESSO',
  FILTER_V60 = 'FILTER_V60',
  CHEMEX = 'CHEMEX',
  FRENCH_PRESS = 'FRENCH_PRESS',
  AEROPRESS = 'AEROPRESS',
  TURKISH = 'TURKISH',
  COLD_BREW = 'COLD_BREW',
}

/**
 * Order status machine. Staff move an order forward one step at a time; cancelling is
 * possible until it ships. DELIVERED, CANCELLED and REFUNDED are closed.
 */
export const ORDER_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING_PAYMENT: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export const REFUNDABLE_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED'];

/** Statuses that count as a sale (paid online, or cash order confirmed) */
export const SOLD_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'PREPARING', 'SHIPPED', 'DELIVERED'];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
