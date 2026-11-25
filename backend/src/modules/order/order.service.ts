import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Order, OrderItem, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  canTransition,
  ONLINE_PAYMENT_METHODS,
  ORDER_TRANSITIONS,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  REFUNDABLE_STATUSES,
  UserRole,
} from '../../common/enums';
import { IJwtPayload, IPaginatedResult } from '../../common/interfaces';
import { runInBackground } from '../../common/utilities/background';
import { CacheService } from '../../common/utilities/caching';
import { EmailService } from '../../common/utilities/emails';
import type { IEmailOrder } from '../../common/utilities/emails/email.templates';
import { ilike, pageArgs, paginated, PrismaService, toOrderBy } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CartService } from '../cart/cart.service';
import { CouponService } from '../coupon/coupon.service';
import { GiftCardService } from '../gift-card/gift-card.service';
import { PushService } from '../notifications/push.service';
import { PaymentService } from '../payment/payment.service';
import { ProductService } from '../product/product.service';
import { SettingsService } from '../store/settings.service';
import { ShippingService } from '../store/shipping.service';
import { CreateCheckoutOrderDto, QueryOrdersDto, RefundOrderDto, UpdateOrderStatusDto } from './dto';
import { OrderEntity, OrderHistoryView, OrderItemView } from './entities/order.entity';
import { InvoiceService } from './invoice.service';

type Tx = Prisma.TransactionClient;

const DETAIL_INCLUDE = {
  items: true,
  user: { select: { id: true, fullName: true, isGuest: true } },
  statusHistory: {
    orderBy: { createdAt: 'asc' },
    include: { by: { select: { id: true, fullName: true } } },
  },
} satisfies Prisma.OrderInclude;

type OrderDetail = Prisma.OrderGetPayload<{ include: typeof DETAIL_INCLUDE }>;
type OrderWithItems = Order & { items: OrderItem[] };

const isOnline = (method: PaymentMethod) => (ONLINE_PAYMENT_METHODS as readonly string[]).includes(method);

/** Stock is taken once the order leaves PENDING_PAYMENT (cash orders start CONFIRMED) */
const holdsStock = (status: OrderStatus) => status !== OrderStatus.PENDING_PAYMENT;

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
    private readonly couponService: CouponService,
    @Inject(forwardRef(() => PaymentService))
    private readonly paymentService: PaymentService,
    private readonly emailService: EmailService,
    private readonly push: PushService,
    private readonly cacheService: CacheService,
    private readonly shipping: ShippingService,
    private readonly settings: SettingsService,
    private readonly giftCards: GiftCardService,
    private readonly audit: AuditService,
    private readonly invoices: InvoiceService,
  ) {}

  /** Unguessable, human-friendly reference: DIB-YYMMDD-XXXXXX */
  private static generateOrderNumber(): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const suffix = Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join('');
    const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return `DIB-${date}-${suffix}`;
  }

  // ---------------------------------------------------------------------------
  // Stock
  // ---------------------------------------------------------------------------

  /** Take stock for one line atomically; false when there isn't enough left */
  private async takeStock(tx: Tx, item: Pick<OrderItem, 'productId' | 'variantId' | 'quantity'>): Promise<boolean> {
    if (!item.productId) return true;
    if (item.variantId) {
      const variant = await tx.productVariant.findUnique({ where: { id: item.variantId }, select: { stock: true } });
      if (variant && variant.stock !== null) {
        const n = await tx.$executeRaw`
          UPDATE product_variants SET stock = stock - ${item.quantity}, "updatedAt" = now()
          WHERE id = ${item.variantId} AND stock >= ${item.quantity}`;
        if (n === 0) return false;
        await tx.$executeRaw`
          UPDATE products SET "soldCount" = "soldCount" + ${item.quantity}, "updatedAt" = now()
          WHERE id = ${item.productId}`;
        return true;
      }
    }
    const n = await tx.$executeRaw`
      UPDATE products SET stock = stock - ${item.quantity}, "soldCount" = "soldCount" + ${item.quantity}, "updatedAt" = now()
      WHERE id = ${item.productId} AND stock >= ${item.quantity}`;
    return n > 0;
  }

  private async returnStock(tx: Tx, items: Array<Pick<OrderItem, 'productId' | 'variantId' | 'quantity'>>): Promise<void> {
    for (const item of items) {
      if (!item.productId) continue;
      if (item.variantId) {
        const n = await tx.$executeRaw`
          UPDATE product_variants SET stock = stock + ${item.quantity}, "updatedAt" = now()
          WHERE id = ${item.variantId} AND stock IS NOT NULL`;
        if (n > 0) {
          await tx.$executeRaw`
            UPDATE products SET "soldCount" = GREATEST(0, "soldCount" - ${item.quantity}), "updatedAt" = now()
            WHERE id = ${item.productId}`;
          continue;
        }
      }
      await tx.$executeRaw`
        UPDATE products SET stock = stock + ${item.quantity},
          "soldCount" = GREATEST(0, "soldCount" - ${item.quantity}), "updatedAt" = now()
        WHERE id = ${item.productId}`;
    }
  }

  /** Staff push when a piece runs low or sells out after an order */
  private async alertLowStock(productIds: Array<string | null>): Promise<void> {
    const ids = productIds.filter((x): x is string => Boolean(x));
    if (!ids.length) return;
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true, name: true, nameAr: true, stock: true, lowStockThreshold: true },
    });
    for (const p of products) {
      if (p.stock > p.lowStockThreshold) continue;
      const soldOut = p.stock <= 0;
      await this.push.toStaff({
        kind: 'stock',
        title: { en: soldOut ? 'Sold out' : 'Running low', ar: soldOut ? 'خلص من المخزون' : 'المخزون قرب يخلص' },
        body: {
          en: soldOut ? `${p.name} is sold out` : `${p.name}: ${p.stock} left`,
          ar: soldOut ? `${p.nameAr || p.name} خلص` : `${p.nameAr || p.name}: فاضل ${p.stock}`,
        },
        link: `/admin/products/${p.id}`,
      });
    }
  }

  private async invalidateCatalog(): Promise<void> {
    await this.cacheService.delByPattern('products:*');
  }

  // ---------------------------------------------------------------------------
  // Checkout
  // ---------------------------------------------------------------------------

  async createCheckoutOrder(dto: CreateCheckoutOrderDto, user?: IJwtPayload, guestSessionId?: string) {
    const cart = await this.cartService.getActiveCart(user, guestSessionId);
    if (!cart.items.length) throw new BadRequestException('Your bag is empty');

    // Fresh prices and stock from the database, never from the cart
    const products = await this.prisma.product.findMany({
      where: { id: { in: cart.items.map((i) => i.productId) } },
      include: { variants: true },
    });
    const items: Array<Omit<OrderItem, 'id' | 'orderId'>> = [];
    for (const line of cart.items) {
      const product = products.find((p) => p.id === line.productId);
      if (!product || product.deletedAt || !product.isActive) {
        throw new BadRequestException(`"${line.name}" is no longer available`);
      }
      const variant = line.variantId
        ? product.variants.find((v) => v.id === line.variantId && v.isActive)
        : line.variantLabel
          ? product.variants.find((v) => v.isActive && v.label.toLowerCase() === line.variantLabel!.toLowerCase())
          : undefined;
      if ((line.variantId || line.variantLabel) && !variant) {
        throw new BadRequestException(`A version of "${product.name}" is no longer available`);
      }
      const stock = variant && variant.stock !== null ? variant.stock : product.stock;
      if (stock < line.quantity) {
        throw new BadRequestException(`Only ${stock} of "${product.name}" left in stock`);
      }
      const unitPriceCents = variant ? ProductService.variantPrice(product, variant) : product.finalPriceCents;
      items.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        sku: variant?.sku || product.sku,
        name: product.name,
        nameAr: product.nameAr,
        imageUrl: product.imageUrls[0] ?? null,
        variantLabel: variant?.label ?? null,
        variantLabelAr: variant?.labelAr ?? null,
        selectedGrind: line.selectedGrind,
        unitPriceCents,
        costCents: product.costCents,
        quantity: line.quantity,
        lineTotalCents: unitPriceCents * line.quantity,
      });
    }

    const email = dto.customerEmail.toLowerCase().trim();
    const subTotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);

    let discountCents = 0;
    let couponCode: string | null = null;
    if (dto.couponCode?.trim()) {
      const coupon = await this.couponService.validateAndCalculateDiscount({
        code: dto.couponCode,
        subTotalCents,
        email,
      });
      discountCents = coupon.discountCents;
      couponCode = coupon.code;
    }

    const governorate = dto.shippingAddress.governorate || dto.shippingAddress.city;
    const quote = await this.shipping.quote(governorate, subTotalCents - discountCents);

    let giftCardCode: string | null = null;
    let giftCardCents = 0;
    const beforeGift = subTotalCents - discountCents + quote.feeCents;
    if (dto.giftCardCode?.trim()) {
      const card = await this.giftCards.check(dto.giftCardCode);
      giftCardCode = card.code;
      giftCardCents = Math.min(card.balanceCents, beforeGift);
    }
    const totalCents = Math.max(0, beforeGift - giftCardCents);

    const online = isOnline(dto.paymentMethod) && totalCents > 0;
    if (isOnline(dto.paymentMethod) && totalCents > 0 && totalCents < 100) {
      throw new BadRequestException('Online payments need at least 1 EGP');
    }

    const orderNumber = OrderService.generateOrderNumber();
    const base: Prisma.OrderUncheckedCreateInput = {
      orderNumber,
      userId: user?.sub ?? null,
      guestSessionId: cart.guestSessionId || guestSessionId || null,
      customerName: dto.customerName.trim(),
      customerEmail: email,
      customerPhone: dto.customerPhone.trim(),
      governorate: quote.governorate,
      city: dto.shippingAddress.city,
      street: dto.shippingAddress.street,
      building: dto.shippingAddress.building || 'NA',
      floor: dto.shippingAddress.floor || 'NA',
      apartment: dto.shippingAddress.apartment || 'NA',
      postalCode: dto.shippingAddress.postalCode || 'NA',
      notes: dto.notes?.trim() || null,
      locale: dto.locale === 'ar' ? 'ar' : 'en',
      subTotalCents,
      discountCents,
      couponCode,
      shippingFeeCents: quote.feeCents,
      giftCardCode,
      giftCardCents,
      totalCents,
      paymentMethod: dto.paymentMethod,
    };

    // ---- Online payment: the order waits for Paymob; stock is taken when the money arrives
    if (online) {
      const order = await this.prisma.order.create({
        data: {
          ...base,
          status: OrderStatus.PENDING_PAYMENT,
          paymentStatus: PaymentStatus.PENDING,
          items: { create: items },
          statusHistory: { create: { toStatus: OrderStatus.PENDING_PAYMENT, note: 'Waiting for online payment' } },
        },
      });

      const nameParts = dto.customerName.trim().split(/\s+/);
      const walletId = process.env.PAYMOB_INTEGRATION_ID_WALLET?.trim();
      const paymentMethods =
        dto.paymentMethod === PaymentMethod.MOBILE_WALLET && walletId && /^\d+$/.test(walletId)
          ? [Number(walletId)]
          : undefined;

      let intention: Awaited<ReturnType<PaymentService['createPaymobIntention']>>;
      try {
        intention = await this.paymentService.createPaymobIntention({
          orderNumber,
          amountCents: totalCents,
          currency: 'EGP',
          userId: user?.sub,
          guestSessionId: cart.guestSessionId || guestSessionId,
          paymentMethod: dto.paymentMethod,
          ...(paymentMethods ? { paymentMethods } : {}),
          items: [
            {
              name: `DI BARISTA Order #${orderNumber}`,
              amount: totalCents,
              description: couponCode ? `Coffee order (code ${couponCode})` : 'Specialty coffee order',
              quantity: 1,
            },
          ],
          billingData: {
            first_name: nameParts[0] || 'Customer',
            last_name: nameParts.slice(1).join(' ') || 'Guest',
            email,
            phone_number: dto.customerPhone.trim(),
            street: dto.shippingAddress.street,
            city: dto.shippingAddress.city,
            building: dto.shippingAddress.building || 'NA',
            floor: dto.shippingAddress.floor || 'NA',
            apartment: dto.shippingAddress.apartment || 'NA',
            country: 'EG',
          },
        });
      } catch (error) {
        // Paymob never opened, so nothing was charged: close the order right away
        await this.prisma.order.update({
          where: { id: order.id },
          data: {
            status: OrderStatus.CANCELLED,
            paymentStatus: PaymentStatus.FAILED,
            cancelReason: `Online payment could not be started: ${(error as Error).message.slice(0, 300)}`,
            statusHistory: {
              create: {
                fromStatus: OrderStatus.PENDING_PAYMENT,
                toStatus: OrderStatus.CANCELLED,
                note: 'Online payment could not be started',
              },
            },
          },
        });
        throw error;
      }

      await this.prisma.order.update({
        where: { id: order.id },
        data: { paymobOrderId: intention.paymobOrderId, intentionId: intention.paymobIntentionId },
      });

      runInBackground(
        this.push.toStaff({
          kind: 'order',
          title: { en: 'New order · waiting for payment', ar: 'طلب جديد · مستني الدفع' },
          body: { en: `${orderNumber} · ${base.customerName}`, ar: `${orderNumber} · ${base.customerName}` },
          link: `/admin/orders/${order.id}`,
        }),
        'push',
      );

      return {
        orderNumber,
        subTotalCents,
        discountCents,
        shippingFeeCents: quote.feeCents,
        giftCardCents,
        totalCents,
        couponCode,
        status: OrderStatus.PENDING_PAYMENT,
        checkoutUrl: intention.checkoutUrl,
        clientSecret: intention.clientSecret,
      };
    }

    // ---- Cash on delivery (or fully covered by a gift card): confirm now, in one transaction
    const paidByGiftCard = totalCents === 0;
    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          ...base,
          paymentMethod: paidByGiftCard && isOnline(dto.paymentMethod) ? PaymentMethod.CASH_ON_DELIVERY : dto.paymentMethod,
          status: OrderStatus.CONFIRMED,
          paymentStatus: paidByGiftCard ? PaymentStatus.PAID : PaymentStatus.UNPAID,
          items: { create: items },
          statusHistory: {
            create: {
              toStatus: OrderStatus.CONFIRMED,
              note: paidByGiftCard ? 'Paid with a gift card' : 'Cash on delivery order placed',
            },
          },
        },
        include: { items: true },
      });
      for (const item of created.items) {
        if (!(await this.takeStock(tx, item))) {
          throw new BadRequestException(`"${item.name}" just sold out`);
        }
      }
      if (couponCode && !(await this.couponService.claimUsage(tx, couponCode, created.id, email))) {
        throw new BadRequestException(`The code "${couponCode}" has just been used up`);
      }
      if (giftCardCode && !(await this.giftCards.redeem(tx, giftCardCode, giftCardCents))) {
        throw new BadRequestException('The gift card balance changed, please try again');
      }
      return created;
    });

    await Promise.all([
      this.cartService.clearCart(user, cart.guestSessionId || guestSessionId),
      this.invalidateCatalog(),
    ]);
    this.afterOrderPlaced(order, paidByGiftCard);

    return {
      orderNumber,
      subTotalCents,
      discountCents,
      shippingFeeCents: quote.feeCents,
      giftCardCents,
      totalCents,
      couponCode,
      status: order.status,
    };
  }

  /** Emails, staff push, orders inbox copy, low-stock alerts (never block the request) */
  private afterOrderPlaced(order: OrderWithItems, paid: boolean): void {
    const emailOrder = this.toEmailOrder(order);
    runInBackground(this.emailService.sendOrderConfirmation(emailOrder, paid), 'email');
    runInBackground(
      this.push.toStaff({
        kind: paid && isOnline(order.paymentMethod) ? 'payment' : 'order',
        title: paid
          ? { en: 'New paid order', ar: 'طلب جديد مدفوع' }
          : { en: 'New order · cash on delivery', ar: 'طلب جديد · دفع عند الاستلام' },
        body: {
          en: `${order.orderNumber} · ${order.customerName} · ${(order.totalCents / 100).toFixed(0)} EGP`,
          ar: `${order.orderNumber} · ${order.customerName} · ${(order.totalCents / 100).toFixed(0)} ج.م`,
        },
        link: `/admin/orders/${order.id}`,
      }),
      'push',
    );
    runInBackground(
      (async () => {
        const inbox = (await this.settings.get<string>('orders.inboxEmail')) || process.env.ORDERS_EMAIL || '';
        if (!inbox) return;
        const pdf = await this.invoices.render(order.id).catch(() => undefined);
        await this.emailService.sendOrdersInbox(inbox, emailOrder, paid, pdf);
      })(),
      'orders-inbox',
    );
    runInBackground(this.alertLowStock(order.items.map((i) => i.productId)), 'stock-alert');
  }

  // ---------------------------------------------------------------------------
  // Paymob
  // ---------------------------------------------------------------------------

  /**
   * Paymob confirmed the payment. Idempotent: the order is claimed (PENDING_PAYMENT → CONFIRMED)
   * atomically before any side effect, so duplicate webhooks never take stock twice.
   */
  async confirmOrderFromPaymobWebhook(params: {
    orderNumber?: string;
    paymobOrderId?: number;
    transactionId: number;
    amountCents: number;
    currency?: string;
  }): Promise<Order | null> {
    let order: Order | null = null;
    if (params.orderNumber) {
      const ref = params.orderNumber.trim().toUpperCase();
      const short = ref.split('-').slice(0, 3).join('-');
      order = await this.prisma.order.findFirst({ where: { orderNumber: { in: [ref, short] } } });
    }
    if (!order && params.paymobOrderId) {
      order = await this.prisma.order.findFirst({ where: { paymobOrderId: params.paymobOrderId } });
    }
    if (!order) {
      this.logger.warn(`Webhook for unknown order (${params.orderNumber} / ${params.paymobOrderId})`);
      return null;
    }

    const currency = (params.currency || 'EGP').toUpperCase();
    if (!Number.isFinite(params.amountCents) || params.amountCents < order.totalCents || currency !== 'EGP') {
      this.logger.error(
        `Paymob amount mismatch on ${order.orderNumber}: paid ${params.amountCents} ${currency}, expected ${order.totalCents}`,
      );
      await this.prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: order.status,
          note: `Payment amount mismatch on Paymob txn ${params.transactionId}: paid ${params.amountCents} ${currency}. Not confirmed.`,
        },
      });
      return null;
    }

    const claimed = await this.prisma.order.updateMany({
      where: { id: order.id, status: OrderStatus.PENDING_PAYMENT, paymentStatus: { not: PaymentStatus.PAID } },
      data: {
        status: OrderStatus.CONFIRMED,
        paymentStatus: PaymentStatus.PAID,
        ...(params.paymobOrderId ? { paymobOrderId: params.paymobOrderId } : {}),
      },
    });
    if (claimed.count === 0) {
      if (order.paymentStatus !== PaymentStatus.PAID) {
        // e.g. the unpaid order expired and was cancelled before the money arrived
        this.logger.error(`Paid Paymob txn ${params.transactionId} for ${order.orderNumber} in status ${order.status}`);
        await this.prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: order.status,
            note: `Paymob payment ${params.transactionId} arrived while the order was ${order.status}. Refund or re-open it.`,
          },
        });
        runInBackground(
          this.push.toStaff({
            kind: 'payment',
            title: { en: 'Payment needs a look', ar: 'دفع محتاج مراجعة' },
            body: {
              en: `${order.orderNumber} was paid after it was ${order.status.toLowerCase()}`,
              ar: `${order.orderNumber} اتدفع بعد ما كان ${order.status}`,
            },
            link: `/admin/orders/${order.id}`,
          }),
          'push',
        );
      }
      return order;
    }

    const full = await this.prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    const problems: string[] = [];
    await this.prisma.$transaction(async (tx) => {
      for (const item of full.items) {
        if (!(await this.takeStock(tx, item))) problems.push(`out of stock: ${item.name}`);
      }
      if (full.couponCode && !(await this.couponService.claimUsage(tx, full.couponCode, full.id, full.customerEmail))) {
        problems.push(`code ${full.couponCode} was over its limit`);
      }
      if (full.giftCardCode && !(await this.giftCards.redeem(tx, full.giftCardCode, full.giftCardCents))) {
        problems.push(`gift card ${full.giftCardCode} balance was too low`);
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId: full.id,
          fromStatus: OrderStatus.PENDING_PAYMENT,
          toStatus: OrderStatus.CONFIRMED,
          note: `Paid online (Paymob ${params.transactionId})${problems.length ? `. Check: ${problems.join('; ')}` : ''}`,
        },
      });
    });

    await Promise.all([
      this.cartService.clearCart(
        full.userId ? ({ sub: full.userId } as IJwtPayload) : undefined,
        full.guestSessionId ?? undefined,
      ),
      this.invalidateCatalog(),
    ]);
    this.afterOrderPlaced(full, true);
    return full;
  }

  /** Paymob says a refund happened. If we started it, it's already recorded; else record it now */
  async recordGatewayRefund(orderNumber: string, amountCents: number): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { orderNumber: orderNumber.trim().toUpperCase() } });
    if (!order || order.refundedCents > 0 || order.status === OrderStatus.REFUNDED) return;
    await this.refundOrder(
      order.id,
      { reason: 'Refunded from the Paymob dashboard', amountPiasters: Math.min(amountCents || order.totalCents, order.totalCents), restock: true },
      undefined,
      { refundedAtGateway: true },
    );
  }

  // ---------------------------------------------------------------------------
  // Staff actions
  // ---------------------------------------------------------------------------

  async updateStatusByStaff(id: string, dto: UpdateOrderStatusDto, staffUserId: string, staffRole?: UserRole) {
    const order = await this.prisma.order.findFirst({ where: { id, deletedAt: null }, include: { items: true } });
    if (!order) throw new NotFoundException('This order no longer exists');

    const next = dto.status;
    const current = order.status;
    if (next === current) return this.findByIdForStaff(id);
    if (!canTransition(current, next)) {
      throw new BadRequestException(
        ORDER_TRANSITIONS[current].length
          ? `An order that is ${current} can only move to ${ORDER_TRANSITIONS[current].join(' or ')}`
          : 'This order is closed. Nothing else to do.',
      );
    }
    if (next === OrderStatus.CONFIRMED && isOnline(order.paymentMethod)) {
      throw new BadRequestException('Online orders are confirmed automatically once the payment arrives');
    }
    if (next === OrderStatus.CANCELLED && order.paymentStatus === PaymentStatus.PAID && isOnline(order.paymentMethod)) {
      throw new BadRequestException('This order is already paid online. Refund it so the customer gets the money back.');
    }
    if (next === OrderStatus.CANCELLED && staffRole === UserRole.STAFF && order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Only an admin can cancel a paid order');
    }

    await this.prisma.$transaction(async (tx) => {
      const moved = await tx.order.updateMany({
        where: { id, status: current },
        data: {
          status: next,
          handledByStaffId: staffUserId,
          ...(next === OrderStatus.CANCELLED ? { cancelReason: dto.note?.trim() || 'Cancelled by the store' } : {}),
          // Cash collected at the door
          ...(next === OrderStatus.DELIVERED && !isOnline(order.paymentMethod) ? { paymentStatus: PaymentStatus.PAID } : {}),
        },
      });
      if (moved.count === 0) throw new BadRequestException('Someone else just updated this order. Refresh and try again.');
      await tx.orderStatusHistory.create({
        data: { orderId: id, fromStatus: current, toStatus: next, note: dto.note?.trim() || null, byUserId: staffUserId },
      });
      if (next === OrderStatus.CANCELLED) {
        if (holdsStock(current)) await this.returnStock(tx, order.items);
        if (order.giftCardCode && order.paymentStatus !== PaymentStatus.PENDING) {
          await this.giftCards.restore(tx, order.giftCardCode, order.giftCardCents);
        }
      }
      if (next === OrderStatus.DELIVERED && order.userId) {
        const per = await this.settings.int('loyalty.spendPerPointCents');
        const points = per > 0 ? Math.floor(order.totalCents / per) : 0;
        if (points > 0) {
          await tx.user.update({ where: { id: order.userId }, data: { loyaltyPoints: { increment: points } } });
        }
      }
    });

    if (next === OrderStatus.CANCELLED) await this.invalidateCatalog();
    await this.audit.log(staffUserId, 'order.status', 'order', id, { status: current }, { status: next, note: dto.note });

    const updated = await this.prisma.order.findUniqueOrThrow({ where: { id }, include: { items: true } });
    runInBackground(this.emailService.sendOrderStatusUpdate(this.toEmailOrder(updated), next), 'email');
    if (updated.userId) {
      runInBackground(
        this.push.toCustomer(updated.userId, {
          kind: 'status',
          title: { en: `Order ${updated.orderNumber}`, ar: `طلب ${updated.orderNumber}` },
          body: { en: `Your order is now ${next.toLowerCase()}`, ar: `حالة طلبك: ${next}` },
          link: `/track-order?order=${updated.orderNumber}`,
        }),
        'push',
      );
    }
    return this.findByIdForStaff(id);
  }

  /**
   * Refund all or part of a paid order. Online payments go back through Paymob first; if Paymob
   * refuses, nothing changes. Cash refunds are only recorded.
   */
  async refundOrder(
    identifier: string,
    dto: RefundOrderDto,
    staffUserId?: string,
    options: { refundedAtGateway?: boolean } = {},
  ): Promise<OrderEntity> {
    const key = identifier.trim();
    const order = await this.prisma.order.findFirst({
      where: { deletedAt: null, OR: [{ id: key }, { orderNumber: key.toUpperCase() }] },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('This order no longer exists');
    if (!REFUNDABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(`An order that is ${order.status} can't be refunded`);
    }
    if (order.paymentStatus !== PaymentStatus.PAID && order.paymentStatus !== PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException('Nothing has been paid for this order yet. Cancel it instead.');
    }
    const remaining = order.totalCents - order.refundedCents;
    const amount = dto.amountPiasters ?? remaining;
    if (amount <= 0 || amount > remaining) {
      throw new BadRequestException(`You can refund up to ${(remaining / 100).toFixed(2)} EGP`);
    }
    const full = amount === remaining;
    const reason = dto.reason.trim();

    if (isOnline(order.paymentMethod) && !options.refundedAtGateway) {
      await this.paymentService.refundAtGateway(order.orderNumber, amount);
    }

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: order.id, refundedCents: order.refundedCents },
        data: {
          refundedCents: order.refundedCents + amount,
          refundReason: reason,
          paymentStatus: full ? PaymentStatus.REFUNDED : PaymentStatus.PARTIALLY_REFUNDED,
          ...(full ? { status: OrderStatus.REFUNDED } : {}),
          ...(staffUserId ? { handledByStaffId: staffUserId } : {}),
        },
      });
      if (claimed.count === 0) throw new BadRequestException('Someone else just refunded this order. Refresh and try again.');
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: order.status,
          toStatus: full ? OrderStatus.REFUNDED : order.status,
          note: `${full ? 'Refunded' : 'Partly refunded'} ${(amount / 100).toFixed(2)} EGP: ${reason}`,
          byUserId: staffUserId ?? null,
        },
      });
      if (full && dto.restock !== false) await this.returnStock(tx, order.items);
    });

    await this.invalidateCatalog();
    await this.audit.log(staffUserId, 'order.refund', 'order', order.id, { refundedCents: order.refundedCents }, { amount, reason, full });
    runInBackground(
      this.emailService.sendOrderRefundNotification(order.customerEmail, {
        locale: order.locale === 'ar' ? 'ar' : 'en',
        fullName: order.customerName,
        orderReference: order.orderNumber,
        amountFormatted: (amount / 100).toFixed(2),
        currency: 'EGP',
        customMessage: reason,
      }),
      'email',
    );
    return this.findByIdForStaff(order.id);
  }

  /** Online orders nobody paid for within N minutes: cancel (no stock was taken) */
  async expireUnpaidOrders(): Promise<number> {
    const minutes = (await this.settings.int('orders.unpaidExpiryMinutes')) || 30;
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    const stale = await this.prisma.order.findMany({
      where: { status: OrderStatus.PENDING_PAYMENT, createdAt: { lt: cutoff }, deletedAt: null },
      select: { id: true },
      take: 200,
    });
    let count = 0;
    for (const { id } of stale) {
      const moved = await this.prisma.order.updateMany({
        where: { id, status: OrderStatus.PENDING_PAYMENT },
        data: { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.UNPAID, cancelReason: 'Not paid in time' },
      });
      if (moved.count) {
        count += 1;
        await this.prisma.orderStatusHistory.create({
          data: { orderId: id, fromStatus: OrderStatus.PENDING_PAYMENT, toStatus: OrderStatus.CANCELLED, note: `Not paid within ${minutes} minutes` },
        });
      }
    }
    if (count) this.logger.log(`Cancelled ${count} unpaid order(s)`);
    return count;
  }

  /** Serverless-friendly: run the expiry at most once a minute when the dashboard reads orders */
  async maybeExpireUnpaid(): Promise<void> {
    if (await this.cacheService.exists('jobs:expire-unpaid')) return;
    await this.cacheService.set('jobs:expire-unpaid', 1, 60);
    await this.expireUnpaidOrders().catch((e) => this.logger.warn(`Expiry failed: ${(e as Error).message}`));
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  private buildWhere(query: QueryOrdersDto): Prisma.OrderWhereInput {
    const and: Prisma.OrderWhereInput[] = [{ deletedAt: null }];
    if (query.paymentStatus) and.push({ paymentStatus: query.paymentStatus });
    if (query.paymentMethod) and.push({ paymentMethod: query.paymentMethod });
    if (query.fromDate || query.toDate) {
      and.push({
        createdAt: {
          ...(query.fromDate ? { gte: new Date(query.fromDate) } : {}),
          ...(query.toDate ? { lte: endOfDay(query.toDate) } : {}),
        },
      });
    }
    if (query.customer?.trim()) {
      const c = query.customer.trim();
      and.push(c.includes('@') ? { customerEmail: c.toLowerCase(), userId: null } : { userId: c });
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      and.push({
        OR: [
          { orderNumber: ilike(q) },
          { customerName: ilike(q) },
          { customerEmail: ilike(q) },
          { customerPhone: { contains: q.replace(/\s/g, '') } },
        ],
      });
    }
    return { AND: and };
  }

  async findAllForStaff(query: QueryOrdersDto) {
    await this.maybeExpireUnpaid();
    const base = this.buildWhere(query);
    const where: Prisma.OrderWhereInput = query.status ? { AND: [base, { status: query.status }] } : base;
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const [docs, total, counts] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: { select: { quantity: true } }, user: { select: { id: true, isGuest: true } } },
        orderBy: toOrderBy(query.sort, ['createdAt', 'totalCents', 'orderNumber']),
        skip,
        take,
      }),
      this.prisma.order.count({ where }),
      query.withCounts === '1'
        ? this.prisma.order.groupBy({ by: ['status'], where: base, _count: { _all: true } })
        : Promise.resolve(null),
    ]);
    const result = paginated(
      docs.map(
        (o) =>
          new OrderEntity({
            id: o.id,
            orderNumber: o.orderNumber,
            userId: o.userId,
            hasAccount: Boolean(o.user && !o.user.isGuest),
            customerName: o.customerName,
            customerEmail: o.customerEmail,
            customerPhone: o.customerPhone,
            itemsCount: o.items.reduce((s, i) => s + i.quantity, 0),
            items: [],
            shippingAddress: address(o),
            subTotalCents: o.subTotalCents,
            discountCents: o.discountCents,
            shippingFeeCents: o.shippingFeeCents,
            totalCents: o.totalCents,
            refundedCents: o.refundedCents,
            paymentMethod: o.paymentMethod,
            paymentStatus: o.paymentStatus,
            status: o.status,
            createdAt: o.createdAt,
            updatedAt: o.updatedAt,
          }),
      ),
      total,
      page,
      limit,
    );
    if (counts) {
      const byStatus: Record<string, number> = {};
      for (const row of counts) byStatus[row.status] = row._count._all;
      const all = Object.values(byStatus).reduce((a, b) => a + b, 0);
      return { docs: result.docs, meta: { ...result.meta, counts: { ALL: all, ...byStatus } } as typeof result.meta };
    }
    return result;
  }

  async findByIdForStaff(id: string): Promise<OrderEntity> {
    const order = await this.prisma.order.findFirst({ where: { id, deletedAt: null }, include: DETAIL_INCLUDE });
    if (!order) throw new NotFoundException('This order no longer exists');
    const payments = await this.paymentService.listForOrder(order.orderNumber);
    return this.toDetail(order, payments);
  }

  async findMyOrders(user: IJwtPayload, query: QueryOrdersDto): Promise<IPaginatedResult<OrderEntity>> {
    const where: Prisma.OrderWhereInput = {
      deletedAt: null,
      OR: [{ userId: user.sub }, { customerEmail: user.email.toLowerCase().trim() }],
      ...(query.status ? { status: query.status } : {}),
    };
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const [docs, total] = await Promise.all([
      this.prisma.order.findMany({ where, include: DETAIL_INCLUDE, orderBy: { createdAt: 'desc' }, skip, take }),
      this.prisma.order.count({ where }),
    ]);
    return paginated(docs.map((o) => this.toDetail(o, undefined, true)), total, page, limit);
  }

  private static normalizePhone(phone: string): string {
    let digits = phone.replace(/[^\d]/g, '');
    if (digits.startsWith('01') && digits.length === 11) digits = `2${digits}`;
    else if (digits.startsWith('0020')) digits = digits.slice(2);
    return digits;
  }

  async trackOrder(orderNumber: string, email?: string, phone?: string, contact?: string) {
    // Same answer for "no such order" and "wrong contact" so order numbers can't be probed
    const notFound = new NotFoundException('No order matches this order number and contact information');
    const order = await this.prisma.order.findUnique({
      where: { orderNumber: orderNumber.trim().toUpperCase() },
      include: DETAIL_INCLUDE,
    });
    if (!order || order.deletedAt) throw notFound;

    let emailToCheck = email?.trim();
    let phoneToCheck = phone?.trim();
    if (contact?.trim()) {
      if (contact.includes('@')) emailToCheck = contact.trim();
      else phoneToCheck = contact.trim();
    }
    if (!emailToCheck && !phoneToCheck) {
      throw new BadRequestException('Enter the email or phone number used at checkout');
    }
    if (emailToCheck && order.customerEmail.toLowerCase() !== emailToCheck.toLowerCase()) throw notFound;
    if (phoneToCheck && OrderService.normalizePhone(order.customerPhone) !== OrderService.normalizePhone(phoneToCheck)) {
      throw notFound;
    }
    const view = this.toDetail(order, undefined, true);
    return {
      orderNumber: view.orderNumber,
      customerName: view.customerName,
      status: view.status,
      paymentStatus: view.paymentStatus,
      paymentMethod: view.paymentMethod,
      items: view.items,
      subTotalCents: view.subTotalCents,
      discountCents: view.discountCents,
      couponCode: view.couponCode,
      shippingFeeCents: view.shippingFeeCents,
      giftCardCents: view.giftCardCents,
      totalCents: view.totalCents,
      shippingAddress: { city: order.city, street: order.street, building: order.building, governorate: order.governorate },
      history: view.history?.map((h) => ({ toStatus: h.toStatus, createdAt: h.createdAt })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  private toDetail(order: OrderDetail, payments?: unknown[], forCustomer = false): OrderEntity {
    const items: OrderItemView[] = order.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      variantId: i.variantId,
      sku: i.sku,
      name: i.name,
      nameAr: i.nameAr,
      imageUrl: i.imageUrl,
      variantLabel: i.variantLabel,
      variantLabelAr: i.variantLabelAr,
      selectedGrind: i.selectedGrind,
      unitPriceCents: i.unitPriceCents,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
    }));
    const history: OrderHistoryView[] = order.statusHistory.map((h) => ({
      id: h.id,
      fromStatus: h.fromStatus,
      toStatus: h.toStatus,
      note: forCustomer ? null : h.note,
      by: forCustomer ? null : h.by,
      createdAt: h.createdAt,
    }));
    return new OrderEntity({
      id: order.id,
      orderNumber: order.orderNumber,
      userId: order.userId,
      hasAccount: Boolean(order.user && !order.user.isGuest),
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      items,
      itemsCount: items.reduce((s, i) => s + i.quantity, 0),
      shippingAddress: address(order),
      notes: order.notes,
      locale: order.locale,
      subTotalCents: order.subTotalCents,
      discountCents: order.discountCents,
      couponCode: order.couponCode,
      shippingFeeCents: order.shippingFeeCents,
      giftCardCode: forCustomer ? null : order.giftCardCode,
      giftCardCents: order.giftCardCents,
      loyaltyPoints: order.loyaltyPoints,
      loyaltyCents: order.loyaltyCents,
      totalCents: order.totalCents,
      refundedCents: order.refundedCents,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      status: order.status,
      cancelReason: order.cancelReason,
      refundReason: order.refundReason,
      ...(forCustomer
        ? {}
        : {
            paymobOrderId: order.paymobOrderId,
            intentionId: order.intentionId,
            handledByStaffId: order.handledByStaffId,
            payments,
            nextStatuses: ORDER_TRANSITIONS[order.status].filter(
              (s) => !(s === OrderStatus.CONFIRMED && isOnline(order.paymentMethod)),
            ),
            canRefund:
              REFUNDABLE_STATUSES.includes(order.status) &&
              (order.paymentStatus === PaymentStatus.PAID || order.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED),
          }),
      history,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  }

  toEmailOrder(order: OrderWithItems): IEmailOrder {
    return {
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      customerPhone: order.customerPhone,
      items: order.items.map((i) => ({
        name: order.locale === 'ar' && i.nameAr ? i.nameAr : i.name,
        quantity: i.quantity,
        lineTotalCents: i.lineTotalCents,
        imageUrl: i.imageUrl,
        variantLabel: (order.locale === 'ar' && i.variantLabelAr) || i.variantLabel || undefined,
      })),
      subTotalCents: order.subTotalCents,
      discountCents: order.discountCents,
      couponCode: order.couponCode,
      shippingFeeCents: order.shippingFeeCents,
      giftCardCents: order.giftCardCents,
      totalCents: order.totalCents,
      paymentMethod: String(order.paymentMethod),
      status: String(order.status),
      shippingAddress: address(order),
      notes: order.notes,
      locale: order.locale === 'ar' ? 'ar' : 'en',
    };
  }
}

function address(o: Order) {
  return {
    governorate: o.governorate,
    city: o.city,
    street: o.street,
    building: o.building,
    floor: o.floor,
    apartment: o.apartment,
    postalCode: o.postalCode,
  };
}

function endOfDay(value: string): Date {
  const d = new Date(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) d.setUTCHours(23, 59, 59, 999);
  return d;
}
