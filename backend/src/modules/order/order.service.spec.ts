import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  GrindType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../../common/enums';
import { NotificationService } from '../../common/services/notification';
import { CacheService } from '../../common/utilities/caching';
import { EmailService } from '../../common/utilities/emails';
import {
  OrderRepository,
  ProductRepository,
} from '../../models/repositories';
import { CartService } from '../cart/cart.service';
import { CouponService } from '../coupon/coupon.service';
import { PaymentService } from '../payment/payment.service';
import { OrderService } from './order.service';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: jest.Mocked<Partial<OrderRepository>>;
  let productRepository: jest.Mocked<Partial<ProductRepository>>;
  let cartService: jest.Mocked<Partial<CartService>>;
  let couponService: jest.Mocked<Partial<CouponService>>;
  let paymentService: jest.Mocked<Partial<PaymentService>>;
  let emailService: jest.Mocked<Partial<EmailService>>;
  let notificationService: jest.Mocked<Partial<NotificationService>>;
  let cacheService: jest.Mocked<Partial<CacheService>>;

  const mockProductId = new Types.ObjectId();

  beforeEach(() => {
    orderRepository = {
      create: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      findByOrderNumber: jest.fn(),
      findByPaymobOrderId: jest.fn(),
      findOneAndUpdate: jest.fn(),
      findById: jest.fn(),
    };
    productRepository = {
      findById: jest.fn(),
      decrementStockAtomically: jest.fn().mockResolvedValue({}),
      incrementStockAtomically: jest.fn().mockResolvedValue({}),
    };
    cartService = {
      getActiveCart: jest.fn(),
      clearCart: jest.fn().mockResolvedValue(undefined),
    };
    couponService = {
      validateAndCalculateDiscount: jest.fn(),
      incrementUsage: jest.fn().mockResolvedValue(true),
    };
    paymentService = {
      createPaymobIntention: jest.fn(),
    };
    emailService = {
      sendPaymentReceipt: jest.fn().mockResolvedValue(undefined),
      sendOrderConfirmation: jest.fn().mockResolvedValue(undefined),
      sendOrderStatusUpdate: jest.fn().mockResolvedValue(true),
    };
    notificationService = {
      emit: jest.fn(),
    };
    cacheService = {
      delByPattern: jest.fn().mockResolvedValue(undefined),
    };

    service = new OrderService(
      orderRepository as unknown as OrderRepository,
      productRepository as unknown as ProductRepository,
      cartService as unknown as CartService,
      couponService as unknown as CouponService,
      paymentService as unknown as PaymentService,
      emailService as unknown as EmailService,
      notificationService as unknown as NotificationService,
      cacheService as unknown as CacheService,
    );
  });

  it('should throw BadRequestException if shopping cart is empty', async () => {
    (cartService.getActiveCart as jest.Mock).mockResolvedValue({
      items: [],
    });

    await expect(
      service.createCheckoutOrder(
        {
          customerName: 'Omar Hassan',
          customerEmail: 'omar@example.com',
          customerPhone: '+201012345678',
          shippingAddress: {
            street: '9 Tahrir St',
            city: 'Cairo',
            building: '12B',
          },
          paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        },
        undefined,
        'guest_session_123',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('should process CASH_ON_DELIVERY checkout with promo coupon discount, decrement stock, and clear cart', async () => {
    (cartService.getActiveCart as jest.Mock).mockResolvedValue({
      guestSessionId: 'guest_session_123',
      items: [
        {
          productId: String(mockProductId),
          name: 'Ethiopian Yirgacheffe',
          quantity: 2,
          selectedGrind: GrindType.WHOLE_BEAN,
        },
      ],
    });

    (productRepository.findById as jest.Mock).mockResolvedValue({
      _id: mockProductId,
      sku: 'DIB-ETH-YIRG-250',
      name: 'Ethiopian Yirgacheffe',
      finalPriceCents: 45000,
      stock: 10,
      isActive: true,
    });

    (couponService.validateAndCalculateDiscount as jest.Mock).mockResolvedValue({
      valid: true,
      couponId: 'coupon_1',
      code: 'COFFEE20',
      discountCents: 18000,
      finalTotalCents: 72000,
    });

    (orderRepository.create as jest.Mock).mockImplementation(async (doc) => ({
      id: 'order_doc_1',
      ...doc,
    }));

    (productRepository.decrementStockAtomically as jest.Mock).mockResolvedValue({
      _id: mockProductId,
    });

    (orderRepository.findByIdAndUpdate as jest.Mock).mockResolvedValue({
      id: 'order_doc_1',
      status: OrderStatus.PROCESSING,
    });

    const result = await service.createCheckoutOrder(
      {
        customerName: 'Omar Hassan',
        customerEmail: 'omar@example.com',
        customerPhone: '+201012345678',
        shippingAddress: {
          street: '9 Tahrir St',
          city: 'Cairo',
          building: '12B',
        },
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        couponCode: 'coffee20',
      },
      undefined,
      'guest_session_123',
    );

    // Subtotal: 2 * 45000 = 90000; Discount: 18000; Shipping: 5000 => Total: 77000
    expect(result.subTotalCents).toBe(90000);
    expect(result.discountCents).toBe(18000);
    expect(result.shippingFeeCents).toBe(5000);
    expect(result.totalCents).toBe(77000);
    expect(result.couponCode).toBe('COFFEE20');
    expect(result.status).toBe(OrderStatus.PROCESSING);
    expect(productRepository.decrementStockAtomically).toHaveBeenCalledWith(
      String(mockProductId),
      2,
    );
    expect(couponService.incrementUsage).toHaveBeenCalledWith('coupon_1');
    expect(cartService.clearCart).toHaveBeenCalled();
    expect(emailService.sendOrderConfirmation).toHaveBeenCalled();
  });

  it('should create Paymob intention and return checkoutUrl + clientSecret for PAYMOB_CARD checkout', async () => {
    (cartService.getActiveCart as jest.Mock).mockResolvedValue({
      guestSessionId: 'guest_session_456',
      items: [
        {
          productId: String(mockProductId),
          name: 'Italian Dark Roast Espresso Blend',
          quantity: 1,
          selectedGrind: GrindType.ESPRESSO,
        },
      ],
    });

    (productRepository.findById as jest.Mock).mockResolvedValue({
      _id: mockProductId,
      sku: 'DIB-ITA-ESP-500',
      name: 'Italian Dark Roast Espresso Blend',
      finalPriceCents: 68000,
      stock: 5,
      isActive: true,
    });

    (orderRepository.create as jest.Mock).mockImplementation(async (doc) => ({
      id: 'order_doc_2',
      ...doc,
    }));

    (paymentService.createPaymobIntention as jest.Mock).mockResolvedValue({
      paymentId: 'pay_1',
      paymobIntentionId: 'pi_test_123',
      paymobOrderId: 998877,
      clientSecret: 'egy_csk_test_secret',
      checkoutUrl:
        'https://accept.paymob.com/unifiedcheckout/?publicKey=pk&clientSecret=egy_csk_test_secret',
    });

    const result = await service.createCheckoutOrder(
      {
        customerName: 'Salma Adel',
        customerEmail: 'salma@example.com',
        customerPhone: '+201112223334',
        shippingAddress: {
          street: 'Road 9',
          city: 'Maadi, Cairo',
          building: '4A',
        },
        paymentMethod: PaymentMethod.PAYMOB_CARD,
      },
      undefined,
      'guest_session_456',
    );

    expect(result.subTotalCents).toBe(68000);
    expect(result.totalCents).toBe(73000);
    expect(result.clientSecret).toBe('egy_csk_test_secret');
    expect(result.checkoutUrl).toContain('unifiedcheckout');
    // Stock is NOT decremented until Paymob webhook confirms payment
    expect(productRepository.decrementStockAtomically).not.toHaveBeenCalled();
  });

  it('should confirm order on Paymob webhook, decrement stock, increment coupon usage, and clear cart', async () => {
    const pendingOrder = {
      id: 'order_doc_2',
      orderNumber: 'DIB-123456-7890',
      userId: null,
      guestSessionId: 'guest_session_456',
      customerName: 'Salma Adel',
      customerEmail: 'salma@example.com',
      totalCents: 73000,
      couponCode: 'COFFEE20',
      paymentStatus: PaymentStatus.PENDING,
      status: OrderStatus.PENDING_PAYMENT,
      items: [
        {
          productId: mockProductId,
          sku: 'DIB-ITA-ESP-500',
          name: 'Italian Dark Roast Espresso Blend',
          quantity: 1,
          unitPriceCents: 68000,
          selectedGrind: GrindType.ESPRESSO,
          lineTotalCents: 68000,
        },
      ],
    };

    (orderRepository.findByOrderNumber as jest.Mock).mockResolvedValue(
      pendingOrder,
    );
    (orderRepository.findOneAndUpdate as jest.Mock).mockResolvedValue({
      ...pendingOrder,
      paymentStatus: PaymentStatus.SUCCESS,
      status: OrderStatus.PAID,
    });

    const confirmed = await service.confirmOrderFromPaymobWebhook({
      orderNumber: 'DIB-123456-7890',
      paymobOrderId: 998877,
      transactionId: 554433,
      amountCents: 73000,
      currency: 'EGP',
    });

    expect(confirmed?.status).toBe(OrderStatus.PAID);
    expect(confirmed?.paymentStatus).toBe(PaymentStatus.SUCCESS);
    expect(productRepository.decrementStockAtomically).toHaveBeenCalledWith(
      String(mockProductId),
      1,
    );
    expect(couponService.incrementUsage).toHaveBeenCalledWith('COFFEE20');
    expect(cartService.clearCart).toHaveBeenCalledWith(
      undefined,
      'guest_session_456',
    );
    expect(emailService.sendOrderConfirmation).toHaveBeenCalled();
  });

  it('should not confirm an order when the paid amount is lower than the order total', async () => {
    (orderRepository.findByOrderNumber as jest.Mock).mockResolvedValue({
      id: 'order_doc_3',
      _id: 'order_doc_3',
      orderNumber: 'DIB-261115-ABCDEF',
      totalCents: 73000,
      items: [],
      paymentStatus: PaymentStatus.INITIATED,
      status: OrderStatus.PENDING_PAYMENT,
    });

    const result = await service.confirmOrderFromPaymobWebhook({
      orderNumber: 'DIB-261115-ABCDEF',
      transactionId: 1,
      amountCents: 100,
      currency: 'EGP',
    });

    expect(result).toBeNull();
    expect(orderRepository.findOneAndUpdate).not.toHaveBeenCalled();
    expect(productRepository.decrementStockAtomically).not.toHaveBeenCalled();
  });

  it('should ignore a duplicate webhook without decrementing stock again', async () => {
    (orderRepository.findByOrderNumber as jest.Mock).mockResolvedValue({
      id: 'order_doc_4',
      _id: 'order_doc_4',
      orderNumber: 'DIB-261115-ZZZZZZ',
      totalCents: 5000,
      items: [{ productId: mockProductId, quantity: 1 }],
      paymentStatus: PaymentStatus.SUCCESS,
      status: OrderStatus.PAID,
    });
    // Atomic claim finds nothing to update: already processed
    (orderRepository.findOneAndUpdate as jest.Mock).mockResolvedValue(null);

    await service.confirmOrderFromPaymobWebhook({
      orderNumber: 'DIB-261115-ZZZZZZ',
      transactionId: 2,
      amountCents: 5000,
    });

    expect(productRepository.decrementStockAtomically).not.toHaveBeenCalled();
    expect(emailService.sendOrderConfirmation).not.toHaveBeenCalled();
  });

  const trackedOrder = {
    orderNumber: 'DIB-111222-3333',
    customerName: 'Omar Hassan',
    customerEmail: 'omar@example.com',
    customerPhone: '01012345678',
    status: OrderStatus.PROCESSING,
    paymentStatus: PaymentStatus.PENDING,
    paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
    items: [],
    subTotalCents: 45000,
    discountCents: 0,
    shippingFeeCents: 5000,
    totalCents: 50000,
    shippingAddress: {
      city: 'Cairo',
      street: '9 Tahrir St',
      building: '12B',
    },
  };

  it('should reject tracking with a wrong email using the same error as an unknown order', async () => {
    (orderRepository.findByOrderNumber as jest.Mock).mockResolvedValue(
      trackedOrder,
    );

    await expect(
      service.trackOrder('DIB-111222-3333', 'wrong@example.com'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should require an email or phone to track an order', async () => {
    (orderRepository.findByOrderNumber as jest.Mock).mockResolvedValue(
      trackedOrder,
    );

    await expect(service.trackOrder('DIB-111222-3333')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should track an order when the phone matches in another format', async () => {
    (orderRepository.findByOrderNumber as jest.Mock).mockResolvedValue(
      trackedOrder,
    );

    const result = await service.trackOrder(
      'DIB-111222-3333',
      undefined,
      undefined,
      '+20 101 234 5678',
    );
    expect(result.orderNumber).toBe('DIB-111222-3333');
  });

  it('should not let staff mark an order as PAID manually', async () => {
    (orderRepository.findById as jest.Mock).mockResolvedValue({
      ...trackedOrder,
      _id: new Types.ObjectId(),
      status: OrderStatus.PENDING_PAYMENT,
      paymentMethod: PaymentMethod.PAYMOB_CARD,
    });

    await expect(
      service.updateStatusByStaff(
        new Types.ObjectId().toString(),
        { status: OrderStatus.PAID },
        new Types.ObjectId().toString(),
      ),
    ).rejects.toThrow(BadRequestException);
  });
});
