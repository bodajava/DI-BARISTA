import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PaymentStatus } from '../../common/enums';
import { SecurityService } from '../../common/services/security';
import { CacheService } from '../../common/utilities/caching';
import { PaymentRepository } from '../../models/repositories';
import { AuthService } from '../auth/auth.service';
import { OrderService } from '../order/order.service';
import { IPaymobTransactionObj } from './dto';
import { PaymentService } from './payment.service';

describe('PaymentService', () => {
  let service: PaymentService;
  let paymentRepository: jest.Mocked<Partial<PaymentRepository>>;
  let orderService: jest.Mocked<Partial<OrderService>>;
  let securityService: SecurityService;

  const mockHmacSecret = 'test_paymob_hmac_secret_key';

  const sampleTransaction: IPaymobTransactionObj = {
    id: 192837465,
    pending: false,
    amount_cents: 50000,
    success: true,
    is_auth: false,
    is_capture: false,
    is_standalone_payment: true,
    is_voided: false,
    is_refunded: false,
    is_3d_secure: true,
    integration_id: 441122,
    has_parent_transaction: false,
    order: {
      id: 99887766,
      merchant_order_id: 'DIB-654321-1234',
    },
    created_at: '2026-11-08T12:00:00.000Z',
    currency: 'EGP',
    error_occured: false,
    owner: 100200,
    source_data: {
      pan: '2346',
      type: 'card',
      sub_type: 'MasterCard',
    },
  };

  beforeEach(() => {
    paymentRepository = {
      findByPaymobOrderId: jest.fn(),
      findByOrderReference: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    orderService = {
      confirmOrderFromPaymobWebhook: jest.fn().mockResolvedValue(null),
    };

    const configService = {
      get: jest.fn((key: string, defaultVal?: unknown) => {
        const map: Record<string, unknown> = {
          PAYMOB_PUBLIC_KEY: 'egy_pk_test_123',
          PAYMOB_SECRET_KEY: 'egy_sk_test_123',
          PAYMOB_CURRENCY: 'EGP',
          PAYMOB_HMAC_SECRET: mockHmacSecret,
          BCRYPT_SALT_ROUNDS: 10,
        };
        return map[key] ?? defaultVal;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'ENCRYPTION_KEY') return 'unit_test_encryption_key_32_chars!!';
        throw new Error(`Missing ${key}`);
      }),
    } as unknown as ConfigService;

    securityService = new SecurityService(configService);

    service = new PaymentService(
      paymentRepository as unknown as PaymentRepository,
      {} as unknown as AuthService,
      orderService as unknown as OrderService,
      configService,
      securityService,
      {} as unknown as CacheService,
    );
  });

  it('should build exact lexicographical Paymob HMAC string and verify webhook signature', async () => {
    const concatenated =
      service.buildPaymobHmacConcatenatedString(sampleTransaction);
    const validHmac = createHmac('sha512', mockHmacSecret)
      .update(concatenated)
      .digest('hex');

    (paymentRepository.findByPaymobOrderId as jest.Mock).mockResolvedValue({
      id: 'payment_doc_1',
      orderReference: 'DIB-654321-1234',
    });

    const response = await service.handlePaymobWebhook(
      { type: 'TRANSACTION', obj: sampleTransaction },
      validHmac,
    );

    expect(response.received).toBe(true);
    expect(response.status).toBe(PaymentStatus.SUCCESS);
    expect(response.orderNumber).toBe('DIB-654321-1234');
    expect(paymentRepository.findByIdAndUpdate).toHaveBeenCalled();
    expect(orderService.confirmOrderFromPaymobWebhook).toHaveBeenCalledWith({
      orderNumber: 'DIB-654321-1234',
      paymobOrderId: 99887766,
      transactionId: 192837465,
      amountCents: sampleTransaction.amount_cents,
      currency: sampleTransaction.currency,
    });
  });

  it('should reject forged Paymob webhook HMAC signatures with UnauthorizedException', async () => {
    await expect(
      service.handlePaymobWebhook(
        { type: 'TRANSACTION', obj: sampleTransaction },
        '0'.repeat(128),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should execute 3-step legacy checkout with auth token, order registration, and payment key', async () => {
    const fetchMock = jest.spyOn(global, 'fetch');
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'mock_auth_token_xyz' }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 55443322 }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'mock_payment_key_token_abc' }),
      } as Response);

    (paymentRepository as any).create = jest.fn().mockResolvedValue({
      id: 'pay_doc_99',
    });

    const result = await service.createPaymobLegacyCheckout({
      orderNumber: 'DIB-112233-4455',
      amountCents: 5000,
      currency: 'EGP',
      billingData: {
        first_name: 'Ahmed',
        last_name: 'Test',
        email: 'ahmed@test.com',
        phone_number: '+201012345678',
        street: 'El Tahrir',
        city: 'Cairo',
      },
    });

    expect(result.paymobOrderId).toBe(55443322);
    expect(result.clientSecret).toBe('mock_payment_key_token_abc');
    expect(result.checkoutUrl).toContain('payment_token=mock_payment_key_token_abc');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mockRestore();
  });
});
