import { runInBackground } from '../../common/utilities/background';
import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { FilterQuery, Types } from 'mongoose';
import {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  UserRole,
} from '../../common/enums';
import { AppEvents, PaymentCompletedEvent } from '../../common/events';
import { IJwtPayload, IPaginatedResult } from '../../common/interfaces';
import { NotificationService } from '../../common/services/notification';
import { CacheService } from '../../common/utilities/caching';
import { EmailService } from '../../common/utilities/emails';
import type { IEmailOrder } from '../../common/utilities/emails/email.templates';
import { escapeRegex } from '../../common/utilities/regex';
import {
  OrderRepository,
  ProductRepository,
} from '../../models/repositories';
import { OrderDocument, OrderItem } from '../../models/schemas';
import { CartService } from '../cart/cart.service';
import { CouponService } from '../coupon/coupon.service';
import { PaymentService } from '../payment/payment.service';
import {
  CreateCheckoutOrderDto,
  QueryOrdersDto,
  UpdateOrderStatusDto,
} from './dto';
import { OrderEntity } from './entities/order.entity';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);
  private static readonly DEFAULT_SHIPPING_FEE_CENTS = 5000; // 50 EGP

  /** Statuses staff may move an order through while preparing/delivering it */
  private static readonly FULFILLMENT_STATUSES: readonly OrderStatus[] = [
    OrderStatus.PROCESSING,
    OrderStatus.CONFIRMED,
    OrderStatus.ROASTING,
    OrderStatus.ROASTING_AND_PREPARING,
    OrderStatus.PACKING,
    OrderStatus.SHIPPED,
    OrderStatus.ON_WAY,
    OrderStatus.OUT_FOR_DELIVERY,
    OrderStatus.DELIVERED,
  ];

  private static readonly TERMINAL_STATUSES: readonly OrderStatus[] = [
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
  ];

  private static readonly ONLINE_METHODS: readonly PaymentMethod[] = [
    PaymentMethod.PAYMOB_CARD,
    PaymentMethod.MOBILE_WALLET,
    PaymentMethod.CARD,
  ];

  /** Unguessable, human-friendly reference: DIB-YYMMDD-XXXXXX (base32, ~30 bits of entropy) */
  private static generateOrderNumber(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const bytes = randomBytes(6);
    const suffix = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return `DIB-${date}-${suffix}`;
  }


  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly productRepository: ProductRepository,
    private readonly cartService: CartService,
    private readonly couponService: CouponService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly emailService: EmailService,
    private readonly notificationService: NotificationService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * Complete Checkout Orchestration (POST /api/v1/orders/checkout)
   * Supports both authenticated users and passwordless guests via x-guest-session-id,
   * with Promo Code / Coupon validation & atomic usage tracking.
   */
  async createCheckoutOrder(
    dto: CreateCheckoutOrderDto,
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<{
    orderNumber: string;
    subTotalCents: number;
    discountCents: number;
    shippingFeeCents: number;
    totalCents: number;
    couponCode?: string | null;
    status?: OrderStatus;
    checkoutUrl?: string;
    clientSecret?: string;
  }> {
    const cart = await this.cartService.getActiveCart(user, guestSessionId);
    if (!cart || !cart.items || cart.items.length === 0) {
      throw new BadRequestException('Shopping cart is empty');
    }

    const orderItems: OrderItem[] = [];

    for (const item of cart.items) {
      const product = await this.productRepository.findById(item.productId);
      if (!product || !product.isActive) {
        throw new BadRequestException(
          `Product "${item.name}" is no longer available`,
        );
      }

      if (product.stock < item.quantity) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}". Requested: ${item.quantity}, Available: ${product.stock}`,
        );
      }

      const matchedVariant = item.variantLabel
        ? product.variants?.find(
            (v) =>
              v.label.toLowerCase() === item.variantLabel?.trim().toLowerCase(),
          )
        : undefined;
      const discount = product.discountPercent || 0;
      const unitPriceCents = matchedVariant
        ? Math.max(
            1,
            Math.round(matchedVariant.priceCents * (1 - discount / 100)),
          )
        : product.finalPriceCents;
      const displayName = matchedVariant
        ? `${product.name} — ${matchedVariant.label}`
        : product.name;

      orderItems.push({
        productId: product._id,
        sku: product.sku,
        name: displayName,
        unitPriceCents,
        quantity: item.quantity,
        selectedGrind: item.selectedGrind,
        lineTotalCents: unitPriceCents * item.quantity,
      });
    }

    const subTotalCents = orderItems.reduce(
      (sum, item) => sum + item.lineTotalCents,
      0,
    );

    let discountCents = 0;
    let appliedCouponCode: string | null = null;
    let appliedCouponId: string | null = null;

    if (dto.couponCode && dto.couponCode.trim()) {
      const couponResult =
        await this.couponService.validateAndCalculateDiscount({
          code: dto.couponCode,
          subTotalCents,
          email: dto.customerEmail,
        });
      discountCents = couponResult.discountCents;
      appliedCouponCode = couponResult.code;
      appliedCouponId = couponResult.couponId;
    }

    const shippingFeeCents = OrderService.DEFAULT_SHIPPING_FEE_CENTS;
    const totalCents = Math.max(
      100,
      subTotalCents - discountCents + shippingFeeCents,
    );

    const orderNumber = OrderService.generateOrderNumber();

    const order = await this.orderRepository.create({
      orderNumber,
      userId: user?.sub ? new Types.ObjectId(user.sub) : null,
      guestSessionId: cart.guestSessionId || guestSessionId || null,
      customerName: dto.customerName.trim(),
      customerEmail: dto.customerEmail.toLowerCase().trim(),
      customerPhone: dto.customerPhone.trim(),
      items: orderItems,
      shippingAddress: {
        street: dto.shippingAddress.street,
        city: dto.shippingAddress.city,
        building: dto.shippingAddress.building,
        floor: dto.shippingAddress.floor || 'NA',
        apartment: dto.shippingAddress.apartment || 'NA',
        postalCode: dto.shippingAddress.postalCode || 'NA',
      },
      notes: dto.notes ?? null,
      locale: dto.locale === 'ar' ? 'ar' : 'en',
      subTotalCents,
      discountCents,
      couponCode: appliedCouponCode,
      shippingFeeCents,
      totalCents,
      paymentMethod: dto.paymentMethod,
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.PENDING_PAYMENT,
    });

    // Branch 1: Paymob Unified Checkout (PAYMOB_CARD / MOBILE_WALLET)
    if (
      dto.paymentMethod === PaymentMethod.PAYMOB_CARD ||
      dto.paymentMethod === PaymentMethod.MOBILE_WALLET
    ) {
      const nameParts = dto.customerName.trim().split(/\s+/);
      const firstName = nameParts[0] || 'Customer';
      const lastName = nameParts.slice(1).join(' ') || 'Guest';

      const walletIntegrationId = process.env.PAYMOB_INTEGRATION_ID_WALLET;
      const paymentMethods =
        dto.paymentMethod === PaymentMethod.MOBILE_WALLET &&
        walletIntegrationId &&
        /^\d+$/.test(walletIntegrationId.trim())
          ? [Number(walletIntegrationId.trim())]
          : undefined;

      let intentionResult: Awaited<ReturnType<PaymentService['createPaymobIntention']>>;
      try {
        intentionResult = await this.paymentService.createPaymobIntention({
          orderNumber,
          amountCents: totalCents,
          currency: 'EGP',
          userId: user?.sub,
          guestSessionId: cart.guestSessionId || guestSessionId,
          paymentMethod: dto.paymentMethod,
          ...(paymentMethods ? { paymentMethods } : {}),
          items: [
            {
              name: `DIBARESTA CAFFE Order #${orderNumber}`,
              amount: totalCents,
              description: appliedCouponCode
                ? `Coffee Order (Promo: ${appliedCouponCode})`
                : 'Specialty Coffee Order',
              quantity: 1,
            },
          ],
          billingData: {
            first_name: firstName,
            last_name: lastName,
            email: dto.customerEmail.toLowerCase().trim(),
            phone_number: dto.customerPhone.trim(),
            street: dto.shippingAddress.street,
            city: dto.shippingAddress.city,
            building: dto.shippingAddress.building,
            floor: dto.shippingAddress.floor || 'NA',
            apartment: dto.shippingAddress.apartment || 'NA',
            country: 'EG',
          },
        });
      } catch (error) {
        // Paymob never opened, so nothing was charged: close the order instead of leaving it
        // "waiting for payment" forever (online orders reserve stock only after payment).
        await this.orderRepository.findByIdAndUpdate(order.id, {
          $set: {
            status: OrderStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
            notes: `${order.notes ? `${order.notes}\n` : ''}[SYSTEM] Online payment could not be started: ${(error as Error).message.slice(0, 300)}`,
          },
        });
        throw error;
      }

      await this.orderRepository.findByIdAndUpdate(order.id, {
        $set: {
          paymentStatus: PaymentStatus.INITIATED,
          paymobOrderId: intentionResult.paymobOrderId,
          intentionId: intentionResult.paymobIntentionId,
        },
      });

      return {
        orderNumber,
        subTotalCents,
        discountCents,
        shippingFeeCents,
        totalCents,
        couponCode: appliedCouponCode,
        status: OrderStatus.PENDING_PAYMENT,
        checkoutUrl: intentionResult.checkoutUrl,
        clientSecret: intentionResult.clientSecret,
      };
    }

    // Branch 2: Cash On Delivery (CASH_ON_DELIVERY)
    // Reserve stock item by item; if any item runs out, give back what was already taken.
    const reserved: OrderItem[] = [];
    for (const item of orderItems) {
      const decremented = await this.productRepository.decrementStockAtomically(
        String(item.productId),
        item.quantity,
      );
      if (!decremented) {
        await this.releaseStock(reserved);
        await this.orderRepository.findByIdAndUpdate(order.id, {
          $set: { status: OrderStatus.CANCELLED },
        });
        throw new BadRequestException(
          `Stock exhausted while confirming item "${item.name}"`,
        );
      }
      reserved.push(item);
    }

    if (appliedCouponId) {
      const claimed = await this.couponService.incrementUsage(appliedCouponId);
      if (!claimed) {
        await this.releaseStock(reserved);
        await this.orderRepository.findByIdAndUpdate(order.id, {
          $set: { status: OrderStatus.CANCELLED },
        });
        throw new BadRequestException(
          `Promo code "${appliedCouponCode}" has reached its usage limit`,
        );
      }
    }

    const updatedOrder = await this.orderRepository.findByIdAndUpdate(
      order.id,
      {
        $set: {
          status: OrderStatus.PROCESSING,
        },
      },
    );

    await Promise.all([
      this.cartService.clearCart(user, cart.guestSessionId || guestSessionId),
      this.cacheService.delByPattern('products:*'),
    ]);
    // Not awaited: SMTP can take seconds and must never slow down or fail the checkout
    if (updatedOrder) {
      runInBackground(this.emailService.sendOrderConfirmation(this.toEmailOrder(updatedOrder), false), 'email');
    }

    return {
      orderNumber,
      subTotalCents,
      discountCents,
      shippingFeeCents,
      totalCents,
      couponCode: appliedCouponCode,
      status: updatedOrder?.status ?? OrderStatus.PROCESSING,
    };
  }

  /**
   * Synchronize Order, Inventory, Coupon Usage, Cart, and Invoice Email when Paymob Webhook confirms payment.
   * Idempotent: the order is atomically "claimed" (PENDING -> PAID) before any side effect,
   * so duplicate or concurrent webhooks cannot decrement stock twice.
   */
  async confirmOrderFromPaymobWebhook(params: {
    orderNumber?: string;
    paymobOrderId?: number;
    transactionId: number;
    amountCents: number;
    currency?: string;
  }): Promise<OrderDocument | null> {
    let order: OrderDocument | null = null;

    if (params.orderNumber) {
      const normalizedRef = params.orderNumber
        .trim()
        .toUpperCase()
        .split('-')
        .slice(0, 3)
        .join('-');
      order =
        (await this.orderRepository.findByOrderNumber(params.orderNumber)) ||
        (await this.orderRepository.findByOrderNumber(normalizedRef));
    }

    if (!order && params.paymobOrderId) {
      order = await this.orderRepository.findByPaymobOrderId(
        params.paymobOrderId,
      );
    }

    if (!order) {
      this.logger.warn(
        `No matching Order found for webhook (orderNumber: ${params.orderNumber}, paymobOrderId: ${params.paymobOrderId})`,
      );
      return null;
    }

    // The amount actually paid must cover the order total; otherwise anyone could pay 1 EGP
    // against someone else's order reference.
    const currency = (params.currency || 'EGP').toUpperCase();
    if (
      !Number.isFinite(params.amountCents) ||
      params.amountCents < order.totalCents ||
      currency !== 'EGP'
    ) {
      this.logger.error(
        `Paymob amount mismatch for order ${order.orderNumber}: paid ${params.amountCents} ${currency}, expected ${order.totalCents} EGP (txn ${params.transactionId})`,
      );
      await this.orderRepository.findByIdAndUpdate(order.id, {
        $set: {
          notes: `${order.notes ? `${order.notes}\n` : ''}[SYSTEM] Payment amount mismatch on Paymob txn ${params.transactionId}: paid ${params.amountCents} ${currency}, expected ${order.totalCents}. Order NOT confirmed.`,
        },
      });
      return null;
    }

    const claimed = await this.orderRepository.findOneAndUpdate(
      {
        _id: order._id,
        paymentStatus: { $ne: PaymentStatus.SUCCESS },
        status: {
          $in: [
            OrderStatus.PENDING_PAYMENT,
            OrderStatus.PENDING,
            OrderStatus.PLACED,
          ],
        },
      },
      {
        $set: {
          paymentStatus: PaymentStatus.SUCCESS,
          status: OrderStatus.PAID,
          ...(params.paymobOrderId
            ? { paymobOrderId: params.paymobOrderId }
            : {}),
        },
      },
    );

    if (!claimed) {
      // Already processed (duplicate webhook) or the order was cancelled meanwhile
      if (order.paymentStatus !== PaymentStatus.SUCCESS) {
        this.logger.error(
          `Paymob payment ${params.transactionId} succeeded for order ${order.orderNumber} in status ${order.status}; needs manual review/refund`,
        );
      }
      return order;
    }

    const outOfStock: string[] = [];
    for (const item of claimed.items) {
      const decremented = await this.productRepository.decrementStockAtomically(
        String(item.productId),
        item.quantity,
      );
      if (!decremented) {
        outOfStock.push(item.name);
      }
    }

    if (outOfStock.length > 0) {
      // Paid but not fully in stock: keep the payment, flag the order for the team
      this.logger.error(
        `Order ${claimed.orderNumber} was paid but these items are out of stock: ${outOfStock.join(', ')}`,
      );
      await this.orderRepository.findByIdAndUpdate(claimed.id, {
        $set: {
          notes: `${claimed.notes ? `${claimed.notes}\n` : ''}[SYSTEM] Paid but out of stock: ${outOfStock.join(', ')}. Contact customer or refund.`,
        },
      });
    }

    if (claimed.couponCode) {
      const couponClaimed = await this.couponService.incrementUsage(
        claimed.couponCode,
      );
      if (!couponClaimed) {
        this.logger.warn(
          `Coupon ${claimed.couponCode} exceeded its usage limit on paid order ${claimed.orderNumber}`,
        );
      }
    }

    const mockUserPayload = claimed.userId
      ? ({ sub: String(claimed.userId) } as IJwtPayload)
      : undefined;
    await Promise.all([
      this.cartService.clearCart(
        mockUserPayload,
        claimed.guestSessionId ?? undefined,
      ),
      this.cacheService.delByPattern('products:*'),
    ]);

    runInBackground(this.emailService.sendOrderConfirmation(this.toEmailOrder(claimed), true), 'email');

    this.notificationService.emit(
      AppEvents.PAYMENT_COMPLETED,
      new PaymentCompletedEvent(
        String(params.transactionId),
        claimed.orderNumber,
        claimed.customerEmail,
        claimed.totalCents,
        'EGP',
      ),
    );

    return claimed;
  }

  private async releaseStock(items: OrderItem[]): Promise<void> {
    for (const item of items) {
      await this.productRepository.incrementStockAtomically(
        String(item.productId),
        item.quantity,
      );
    }
  }

  private normalizePhone(phone: string): string {
    let digits = phone.replace(/[^\d]/g, '');
    if (digits.startsWith('01') && digits.length === 11) {
      digits = `2${digits}`;
    } else if (digits.startsWith('0020')) {
      digits = digits.slice(2);
    }
    return digits;
  }

  async trackOrder(
    orderNumber: string,
    email?: string,
    phone?: string,
    contact?: string,
  ): Promise<Partial<OrderEntity>> {
    // Same response for "no such order" and "wrong contact" so order numbers can't be enumerated
    const notFound = new NotFoundException(
      'No order matches this order number and contact information',
    );

    const order = await this.orderRepository.findByOrderNumber(orderNumber);
    if (!order) {
      throw notFound;
    }

    let emailToCheck = email?.trim();
    let phoneToCheck = phone?.trim();

    if (contact && contact.trim()) {
      const trimmedContact = contact.trim();
      if (trimmedContact.includes('@')) {
        emailToCheck = trimmedContact;
      } else {
        phoneToCheck = trimmedContact;
      }
    }

    if (!emailToCheck && !phoneToCheck) {
      throw new BadRequestException(
        'Email or phone number used at checkout is required to track an order',
      );
    }

    if (
      emailToCheck &&
      order.customerEmail.toLowerCase() !== emailToCheck.toLowerCase()
    ) {
      throw notFound;
    }

    if (
      phoneToCheck &&
      this.normalizePhone(order.customerPhone || '') !==
        this.normalizePhone(phoneToCheck)
    ) {
      throw notFound;
    }

    return {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      items: order.items,
      subTotalCents: order.subTotalCents,
      discountCents: order.discountCents,
      couponCode: order.couponCode,
      shippingFeeCents: order.shippingFeeCents,
      totalCents: order.totalCents,
      shippingAddress: {
        city: order.shippingAddress.city,
        street: order.shippingAddress.street,
        building: order.shippingAddress.building,
      },
      createdAt: (order as unknown as { createdAt?: Date }).createdAt,
      updatedAt: (order as unknown as { updatedAt?: Date }).updatedAt,
    };
  }

  async findMyOrders(
    user: IJwtPayload,
    query: QueryOrdersDto,
  ): Promise<IPaginatedResult<OrderEntity>> {
    const filter: FilterQuery<OrderDocument> = {
      $or: [
        { userId: new Types.ObjectId(user.sub) },
        { customerEmail: user.email.toLowerCase().trim() },
      ],
    };

    if (query.status) {
      filter.status = query.status;
    }

    const paginated = await this.orderRepository.paginate(
      filter,
      query.page,
      query.limit,
      { sort: query.sort },
    );

    return {
      docs: paginated.docs.map((doc) => this.toEntity(doc)),
      meta: paginated.meta,
    };
  }

  async findAllForStaff(
    query: QueryOrdersDto,
  ): Promise<IPaginatedResult<OrderEntity>> {
    const filter: FilterQuery<OrderDocument> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.paymentStatus) {
      filter.paymentStatus = query.paymentStatus;
    }

    if (query.fromDate || query.toDate) {
      const dateRange: Record<string, Date> = {};
      if (query.fromDate) dateRange.$gte = new Date(query.fromDate);
      if (query.toDate) dateRange.$lte = new Date(query.toDate);
      (filter as Record<string, unknown>).createdAt = dateRange;
    }

    if (query.search) {
      const regex = new RegExp(
        escapeRegex(query.search.trim().slice(0, 100)),
        'i',
      );
      filter.$or = [
        { orderNumber: regex },
        { customerName: regex },
        { customerEmail: regex },
        { customerPhone: regex },
      ];
    }

    const paginated = await this.orderRepository.paginate(
      filter,
      query.page,
      query.limit,
      { sort: query.sort },
    );

    return {
      docs: paginated.docs.map((doc) => this.toEntity(doc)),
      meta: paginated.meta,
    };
  }

  async findByIdForStaff(id: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order with id "${id}" not found`);
    }
    return this.toEntity(order);
  }

  async updateStatusByStaff(
    id: string,
    dto: UpdateOrderStatusDto,
    staffUserId: string,
    staffRole?: UserRole,
  ): Promise<OrderEntity> {
    const existing = await this.orderRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Order with id "${id}" not found`);
    }

    const next = dto.status;
    const current = existing.status;
    const isOnline = OrderService.ONLINE_METHODS.includes(existing.paymentMethod);
    const isPaid = existing.paymentStatus === PaymentStatus.SUCCESS;

    if (next === current) {
      return this.toEntity(existing);
    }
    if (OrderService.TERMINAL_STATUSES.includes(current)) {
      throw new BadRequestException(
        `Order is already ${current}; its status can no longer change`,
      );
    }
    if (next === OrderStatus.PAID) {
      throw new BadRequestException(
        'Orders become PAID only through a verified Paymob payment',
      );
    }
    if (next === OrderStatus.REFUNDED) {
      throw new BadRequestException('Use the refund action to refund an order');
    }

    if (next === OrderStatus.CANCELLED) {
      if (staffRole === UserRole.BARISTA) {
        throw new ForbiddenException('Only admins can cancel orders');
      }
      if (isOnline && isPaid) {
        throw new BadRequestException(
          'This order is already paid online. Use refund instead of cancel so the customer gets the money back.',
        );
      }
    } else if (!OrderService.FULFILLMENT_STATUSES.includes(next)) {
      throw new BadRequestException(`Status "${next}" cannot be set manually`);
    } else if (isOnline && !isPaid) {
      throw new BadRequestException(
        'Online payment has not been confirmed yet; the order cannot be prepared',
      );
    }

    // Atomic: only applies if nobody changed the status in the meantime
    const updated = await this.orderRepository.findOneAndUpdate(
      { _id: existing._id, status: current },
      {
        $set: {
          status: next,
          handledByStaffId: new Types.ObjectId(staffUserId),
          // Cash collected on delivery
          ...(next === OrderStatus.DELIVERED && !isOnline
            ? { paymentStatus: PaymentStatus.SUCCESS }
            : {}),
        },
      },
    );
    if (!updated) {
      throw new BadRequestException(
        'Order was updated by someone else. Refresh and try again.',
      );
    }

    // COD stock was reserved at checkout; give it back when the order is cancelled
    if (next === OrderStatus.CANCELLED && !isOnline) {
      await this.releaseStock(existing.items);
      await this.cacheService.delByPattern('products:*');
    }

    // Let the customer know their coffee moved forward (fire-and-forget)
    runInBackground(this.emailService.sendOrderStatusUpdate(this.toEmailOrder(updated), String(next)), 'email');

    return this.toEntity(updated);
  }

  /**
   * Refund a paid order:
   * - Atomically claims the order (-> REFUNDED) so two admins can't refund twice
   * - Online payments are refunded through Paymob first; if Paymob fails the claim is rolled back
   * - Restores stock and emails the customer
   */
  async refundOrder(
    identifier: string,
    reason?: string,
    staffUserId?: string,
    options: { refundedAtGateway?: boolean } = {},
  ): Promise<OrderEntity> {
    const trimmed = identifier.trim();
    const order = Types.ObjectId.isValid(trimmed)
      ? await this.orderRepository.findById(trimmed)
      : await this.orderRepository.findByOrderNumber(trimmed);

    if (!order) {
      throw new NotFoundException(`Order "${identifier}" not found`);
    }

    if (order.status === OrderStatus.REFUNDED) {
      if (options.refundedAtGateway) {
        // Paymob confirming a refund we already recorded
        return this.toEntity(order);
      }
      throw new BadRequestException(
        `Order "${order.orderNumber}" has already been refunded`,
      );
    }

    if (order.paymentStatus !== PaymentStatus.SUCCESS) {
      throw new BadRequestException(
        `Order "${order.orderNumber}" has no confirmed payment to refund`,
      );
    }

    const previous = { status: order.status, paymentStatus: order.paymentStatus };
    const claimed = await this.orderRepository.findOneAndUpdate(
      { _id: order._id, status: order.status, paymentStatus: PaymentStatus.SUCCESS },
      {
        $set: {
          status: OrderStatus.REFUNDED,
          paymentStatus: PaymentStatus.REFUNDED,
          ...(staffUserId && Types.ObjectId.isValid(staffUserId)
            ? { handledByStaffId: new Types.ObjectId(staffUserId) }
            : {}),
        },
      },
    );
    if (!claimed) {
      throw new BadRequestException(
        `Order "${order.orderNumber}" is being processed by someone else. Refresh and try again.`,
      );
    }

    const isOnline = OrderService.ONLINE_METHODS.includes(order.paymentMethod);
    if (isOnline && !options.refundedAtGateway) {
      try {
        await this.paymentService.refundAtGateway(
          order.orderNumber,
          order.totalCents,
        );
      } catch (error) {
        await this.orderRepository.findByIdAndUpdate(order.id, {
          $set: previous,
        });
        throw error;
      }
    }

    await this.releaseStock(order.items);

    await Promise.all([
      this.cacheService.delByPattern('products:*'),
      this.emailService.sendOrderRefundNotification(order.customerEmail, {
        locale: order.locale === 'ar' ? 'ar' : 'en',
        fullName: order.customerName,
        orderReference: order.orderNumber,
        amountFormatted: (order.totalCents / 100).toFixed(2),
        currency: 'EGP',
        customMessage: reason || 'Your refund has been processed.',
      }),
    ]);

    return this.toEntity(claimed);
  }

  /** Shape used by the transactional email templates */
  private toEmailOrder(order: OrderDocument): IEmailOrder {
    return {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      items: (order.items || []).map((i) => ({
        name: i.name,
        quantity: i.quantity,
        lineTotalCents: i.lineTotalCents,
        variantLabel: (i as { variantLabel?: string }).variantLabel,
      })),
      subTotalCents: order.subTotalCents,
      discountCents: order.discountCents,
      couponCode: order.couponCode,
      shippingFeeCents: order.shippingFeeCents,
      totalCents: order.totalCents,
      paymentMethod: String(order.paymentMethod),
      status: String(order.status),
      shippingAddress: order.shippingAddress || {},
      notes: order.notes,
      locale: order.locale === 'ar' ? 'ar' : 'en',
    };
  }

  private toEntity(order: OrderDocument): OrderEntity {
    const raw = order as unknown as { createdAt?: Date; updatedAt?: Date };
    return new OrderEntity({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId ? String(order.userId) : null,
      guestSessionId: order.guestSessionId,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      items: order.items,
      shippingAddress: order.shippingAddress,
      notes: order.notes,
      subTotalCents: order.subTotalCents,
      discountCents: order.discountCents ?? 0,
      couponCode: order.couponCode ?? null,
      shippingFeeCents: order.shippingFeeCents,
      totalCents: order.totalCents,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      status: order.status,
      paymobOrderId: order.paymobOrderId,
      intentionId: order.intentionId,
      handledByStaffId: order.handledByStaffId
        ? String(order.handledByStaffId)
        : null,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
