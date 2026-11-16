import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import {
  PaymentMethod,
  PaymentProvider,
  PaymentStatus,
} from '../../common/enums';
import { IJwtPayload } from '../../common/interfaces';
import { SecurityService } from '../../common/services/security';
import { CacheService } from '../../common/utilities/caching';
import { PaymentRepository } from '../../models/repositories';
import { PaymentDocument } from '../../models/schemas';
import { AuthService } from '../auth/auth.service';
import { OrderService } from '../order/order.service';
import {
  InitiatePaymentDto,
  IPaymobTransactionObj,
  PaymobBillingDataDto,
  PaymobWebhookDto,
} from './dto';

interface IPaymobIntentionResponse {
  id: string;
  client_secret: string;
  intention_order_id: number;
}

export interface ICreatePaymobIntentionParams {
  orderNumber: string;
  amountCents: number;
  currency?: string;
  userId?: string;
  guestSessionId?: string;
  paymentMethod?: PaymentMethod;
  paymentMethods?: (number | string)[];
  items?: Array<{
    name: string;
    amount: number;
    description?: string;
    quantity: number;
  }>;
  billingData: PaymobBillingDataDto;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly publicKey: string;
  private readonly secretKey: string;
  private readonly defaultCurrency: string;
  private readonly hmacSecret: string;
  private readonly cardIntegrationId?: number;
  private readonly walletIntegrationId?: number;
  /** Public base URL of this API (e.g. https://api.example.com or an ngrok URL) */
  private readonly apiPublicUrl: string;
  private readonly iframeId: string;

  constructor(
    private readonly paymentRepository: PaymentRepository,
    private readonly authService: AuthService,
    @Inject(forwardRef(() => OrderService))
    private readonly orderService: OrderService,
    private readonly configService: ConfigService,
    private readonly securityService: SecurityService,
    private readonly cacheService: CacheService,
  ) {
    this.baseUrl = this.configService.get<string>(
      'PAYMOB_BASE_URL',
      'https://accept.paymob.com/api',
    );
    this.apiKey = this.configService.get<string>('PAYMOB_API_KEY', '');
    this.publicKey = this.configService.get<string>('PAYMOB_PUBLIC_KEY', '');
    this.secretKey = this.configService.get<string>('PAYMOB_SECRET_KEY', '');
    this.defaultCurrency = this.configService.get<string>(
      'PAYMOB_CURRENCY',
      'EGP',
    );
    this.hmacSecret = this.configService.get<string>('PAYMOB_HMAC_SECRET', '');
    const configuredCardId =
      this.configService.get<number>('PAYMOB_INTEGRATION_ID_CARD') ||
      this.configService.get<number>('PAYMOB_CARD_INTEGRATION_ID');
    this.cardIntegrationId = configuredCardId
      ? Number(configuredCardId)
      : 6056178;
    this.iframeId = this.configService.get<string>(
      'PAYMOB_IFRAME_ID',
      '845942',
    );
    const walletId = Number(this.configService.get<string>('PAYMOB_INTEGRATION_ID_WALLET'));
    this.walletIntegrationId = Number.isInteger(walletId) && walletId > 0 ? walletId : undefined;
    this.apiPublicUrl = (this.configService.get<string>('API_PUBLIC_URL') || '')
      .trim()
      .replace(/\/+$/, '');
  }

  /** The card iframe needs the API key and an iframe ID that belongs to this account */
  private get legacyCheckoutReady(): boolean {
    const iframe = this.configService.get<string>('PAYMOB_IFRAME_ID') || '';
    return (
      this.apiKey.trim().length > 10 &&
      !this.apiKey.includes('replace_me') &&
      /^\d+$/.test(iframe) &&
      iframe !== '845942'
    );
  }

  /** Unified Checkout needs the secret key (create intention) and public key (open the page) */
  private get unifiedCheckoutReady(): boolean {
    const ok = (k: string) => k.trim().length > 20 && !k.includes('replace_me');
    return ok(this.secretKey) && ok(this.publicKey);
  }

  /**
   * Classic / Legacy 3-Step Paymob Checkout:
   * Step 1: POST https://accept.paymob.com/api/auth/tokens (yields auth_token)
   * Step 2: POST https://accept.paymob.com/api/ecommerce/orders (yields paymobOrderId)
   * Step 3: POST https://accept.paymob.com/api/acceptance/payment_keys (yields payment_key_token)
   * Step 4: Checkout iframe URL https://accept.paymob.com/api/acceptance/iframes/{iframeId}?payment_token={token}
   */
  async createPaymobLegacyCheckout(params: ICreatePaymobIntentionParams): Promise<{
    paymentId: string;
    paymobIntentionId: string;
    paymobOrderId: number;
    clientSecret: string;
    checkoutUrl: string;
  }> {
    const currency = (params.currency || this.defaultCurrency || 'EGP').toUpperCase().trim();
    const amountCents = Math.round(Number(params.amountCents));
    const integrationId = Number(
      params.paymentMethods?.[0] || this.cardIntegrationId || 6056178,
    );

    const sanitizeStr = (val?: string, fallback = 'NA', maxLen = 100): string => {
      if (!val) return fallback;
      const cleaned = val
        .replace(/[\r\n\t]/g, ' ')
        .replace(/[^\p{L}\p{N}\s.,\-_#/]/gu, '')
        .trim();
      return cleaned.slice(0, maxLen) || fallback;
    };

    const sanitizePhone = (val?: string): string => {
      if (!val) return '+201000000000';
      let digits = val.replace(/[^\d+]/g, '').trim();
      if (!digits.startsWith('+')) {
        if (digits.startsWith('01') && digits.length === 11) {
          digits = `+2${digits}`;
        } else if (digits.startsWith('20') && digits.length === 12) {
          digits = `+${digits}`;
        }
      }
      return digits.length >= 8 ? digits : '+201000000000';
    };

    const nameParts = (params.billingData.first_name || 'Customer').trim().split(/\s+/);
    const firstName = sanitizeStr(nameParts[0], 'Customer', 50);
    const lastName = sanitizeStr(
      params.billingData.last_name || nameParts.slice(1).join(' ') || 'Guest',
      'Guest',
      50,
    );
    const email = (params.billingData.email || 'customer@example.com').toLowerCase().trim();
    const phone = sanitizePhone(params.billingData.phone_number);
    const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: this.apiKey }),
    });

    if (!authRes.ok) {
      const authErr = await authRes.text();
      this.logger.error(`[Paymob Legacy Step 1 Error (${authRes.status})]: ${authErr}`);
      throw new Error(`Paymob Auth Token failed (${authRes.status}): ${authErr}`);
    }

    const authData = (await authRes.json()) as { token: string };
    const authToken = authData.token;

    // Step 2: Order Registration
    const orderPayload = {
      auth_token: authToken,
      delivery_needed: 'false',
      amount_cents: amountCents,
      currency,
      merchant_order_id: params.orderNumber,
      items: [],
    };
    const orderRes = await fetch('https://accept.paymob.com/api/ecommerce/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(orderPayload),
    });

    if (!orderRes.ok) {
      const orderErr = await orderRes.text();
      this.logger.error(`[Paymob Legacy Step 2 Error (${orderRes.status})]: ${orderErr}`);
      throw new Error(`Paymob Order Registration failed (${orderRes.status}): ${orderErr}`);
    }

    const orderData = (await orderRes.json()) as { id: number };
    const paymobOrderId = orderData.id;

    // Step 3: Payment Key
    const keyPayload = {
      auth_token: authToken,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: paymobOrderId,
      billing_data: {
        first_name: firstName,
        last_name: lastName,
        email,
        phone_number: phone,
        apartment: sanitizeStr(params.billingData.apartment, 'NA', 30),
        floor: sanitizeStr(params.billingData.floor, 'NA', 30),
        street: sanitizeStr(params.billingData.street, 'El Tahrir', 150),
        building: sanitizeStr(params.billingData.building, '1', 50),
        shipping_method: 'PKG',
        postal_code: sanitizeStr(
          params.billingData.postal_code || (params.billingData as any).postalCode,
          '12345',
          20,
        ),
        city: sanitizeStr(params.billingData.city, 'Cairo', 50),
        country: sanitizeStr(params.billingData.country, 'EG', 10),
        state: sanitizeStr(params.billingData.city, 'Cairo', 50),
      },
      currency,
      integration_id: integrationId,
      lock_order_when_paid: 'true',
    };
    const keyRes = await fetch('https://accept.paymob.com/api/acceptance/payment_keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(keyPayload),
    });

    if (!keyRes.ok) {
      const keyErr = await keyRes.text();
      this.logger.error(`[Paymob Legacy Step 3 Error (${keyRes.status})]: ${keyErr}`);
      throw new Error(`Paymob Payment Key generation failed (${keyRes.status}): ${keyErr}`);
    }

    const keyData = (await keyRes.json()) as { token: string };
    const paymentKeyToken = keyData.token;

    const iframeId = this.iframeId || '845942';
    const checkoutUrl = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKeyToken}`;
    const paymobIntentionId = `legacy_${paymobOrderId}`;

    const payment = await this.paymentRepository.create({
      userId:
        params.userId && Types.ObjectId.isValid(params.userId)
          ? new Types.ObjectId(params.userId)
          : null,
      guestSessionId: params.guestSessionId ?? null,
      orderReference: params.orderNumber,
      provider: PaymentProvider.PAYMOB,
      method: params.paymentMethod ?? PaymentMethod.PAYMOB_CARD,
      status: PaymentStatus.PENDING,
      amountCents,
      currency,
      paymobIntentionId,
      paymobOrderId,
      paymentKeyToken,
      clientSecret: paymentKeyToken,
      checkoutUrl,
      billingData: { ...params.billingData },
    });

    return {
      paymentId: payment.id,
      paymobIntentionId,
      paymobOrderId,
      clientSecret: paymentKeyToken,
      checkoutUrl,
    };
  }

  /**
   * Public method invoked by OrderService during PAYMOB_CARD Checkout
   * Creates Paymob Checkout (using Legacy 3-Step or Unified Checkout /v1/intention/)
   * and persists a linked Payment record.
   */
  async createPaymobIntention(params: ICreatePaymobIntentionParams): Promise<{
    paymentId: string;
    paymobIntentionId: string;
    paymobOrderId: number;
    clientSecret: string;
    checkoutUrl: string;
  }> {
    const effectiveParams = { ...params };
    if (
      (!effectiveParams.paymentMethods || effectiveParams.paymentMethods.length === 0) &&
      effectiveParams.paymentMethod === PaymentMethod.MOBILE_WALLET
    ) {
      const walletId = this.configService.get<string>('PAYMOB_INTEGRATION_ID_WALLET');
      if (walletId && /^\d+$/.test(walletId.trim())) {
        effectiveParams.paymentMethods = [Number(walletId.trim())];
      }
    }

    // 1. Unified Checkout (Intention API) is the default: one Paymob page with cards and wallets.
    //    The legacy iframe flow is only used when explicitly requested (PAYMOB_CHECKOUT_MODE=legacy)
    //    or when the Unified Checkout keys are missing.
    const legacyRequested =
      (this.configService.get<string>('PAYMOB_CHECKOUT_MODE') || '').toLowerCase() === 'legacy';
    if (legacyRequested || !this.unifiedCheckoutReady) {
      if (this.apiKey && this.apiKey.trim().length > 10 && !this.apiKey.includes('replace_me')) {
        return this.createPaymobLegacyCheckout(effectiveParams);
      }
    }

    const currency = (effectiveParams.currency || this.defaultCurrency || 'EGP').toUpperCase().trim();
    const amountCents = Math.round(Number(effectiveParams.amountCents));

    // 2. Format and sanitize payment_methods to integer IDs
    const paymentMethods: (number | string)[] = [];
    if (effectiveParams.paymentMethods && effectiveParams.paymentMethods.length > 0) {
      for (const m of effectiveParams.paymentMethods) {
        if (typeof m === 'number') {
          paymentMethods.push(m);
        } else if (typeof m === 'string' && /^\d+$/.test(m.trim())) {
          paymentMethods.push(Number(m.trim()));
        } else if (typeof m === 'string' && m.trim().length > 0) {
          paymentMethods.push(m.trim());
        }
      }
    } else {
      // Show every configured method on the one Unified Checkout page (cards + wallets)
      if (this.cardIntegrationId && !isNaN(this.cardIntegrationId)) {
        paymentMethods.push(Number(this.cardIntegrationId));
      }
      if (this.walletIntegrationId && !paymentMethods.includes(this.walletIntegrationId)) {
        paymentMethods.push(this.walletIntegrationId);
      }
    }

    // 3. Sanitize and validate billing_data
    const sanitizeStr = (val?: string, fallback = 'NA', maxLen = 100): string => {
      if (!val) return fallback;
      const cleaned = val
        .replace(/[\r\n\t]/g, ' ')
        .replace(/[^\p{L}\p{N}\s.,\-_#/]/gu, '')
        .trim();
      return cleaned.slice(0, maxLen) || fallback;
    };

    const sanitizePhone = (val?: string): string => {
      if (!val) return '+201000000000';
      let digits = val.replace(/[^\d+]/g, '').trim();
      if (!digits.startsWith('+')) {
        if (digits.startsWith('01') && digits.length === 11) {
          digits = `+2${digits}`;
        } else if (digits.startsWith('20') && digits.length === 12) {
          digits = `+${digits}`;
        }
      }
      return digits.length >= 8 ? digits : '+201000000000';
    };

    const nameParts = (params.billingData.first_name || 'Customer').trim().split(/\s+/);
    const firstName = sanitizeStr(nameParts[0], 'Customer', 50);
    const lastName = sanitizeStr(
      params.billingData.last_name || nameParts.slice(1).join(' ') || 'Guest',
      'Guest',
      50,
    );
    const email = (params.billingData.email || 'customer@example.com').toLowerCase().trim();
    const phone = sanitizePhone(params.billingData.phone_number);

    const billingData = {
      apartment: sanitizeStr(params.billingData.apartment, 'NA', 30),
      first_name: firstName,
      last_name: lastName,
      street: sanitizeStr(params.billingData.street, 'NA', 150),
      building: sanitizeStr(params.billingData.building, 'NA', 50),
      phone_number: phone,
      city: sanitizeStr(params.billingData.city, 'Cairo', 50),
      country: sanitizeStr(params.billingData.country, 'EG', 10),
      email,
      floor: sanitizeStr(params.billingData.floor, 'NA', 30),
      state: sanitizeStr(params.billingData.city, 'Cairo', 50),
    };

    // 4. Format items with integer cents
    const items =
      params.items && params.items.length > 0
        ? params.items.map((item) => ({
            name: sanitizeStr(item.name, 'Specialty Coffee', 80),
            amount: Math.round(Number(item.amount)),
            description: sanitizeStr(item.description, 'Specialty Coffee', 150),
            quantity: Math.max(1, Math.round(Number(item.quantity) || 1)),
          }))
        : [
            {
              name: `DIBARESTA CAFFE Order #${params.orderNumber}`,
              amount: amountCents,
              description: 'Specialty Coffee Order',
              quantity: 1,
            },
          ];

    const intentionPayload = {
      amount: amountCents,
      currency,
      payment_methods: paymentMethods,
      items,
      billing_data: billingData,
      // Paymob echoes this back as order.merchant_order_id in the webhook and redirect
      special_reference: params.orderNumber,
      extras: { order_number: params.orderNumber },
      // Per-payment callbacks; without API_PUBLIC_URL the URLs saved on the integration are used
      ...(this.apiPublicUrl
        ? {
            notification_url: `${this.apiPublicUrl}/api/v1/payments/paymob/webhook`,
            redirection_url: `${this.apiPublicUrl}/api/v1/payments/paymob/callback`,
          }
        : {}),
    };

    let paymobIntentionId: string;
    let paymobOrderId: number;
    let clientSecret: string;

    try {
      const res = await fetch('https://accept.paymob.com/v1/intention/', {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(intentionPayload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        this.logger.error(
          `[Paymob Intention API Error (Status ${res.status})]: ${errorText}`,
        );
        this.logger.warn(
          `Paymob Intention API returned ${res.status}: ${errorText}`,
        );
        throw new Error(
          `Paymob Intention API failed (${res.status}): ${errorText}`,
        );
      }

      const data = (await res.json()) as IPaymobIntentionResponse;
      paymobIntentionId = data.id;
      paymobOrderId = data.intention_order_id;
      clientSecret = data.client_secret;
    } catch (error) {
      // Simulated intentions are only for automated tests. A missing key in any other
      // environment must fail loudly instead of creating orders that can never be paid.
      const isTestEnv = process.env.NODE_ENV === 'test';

      if (isTestEnv) {
        this.logger.warn(
          `Paymob test/mock environment active (${(error as Error).message}). Using simulated Paymob Intention.`,
        );
        paymobIntentionId = `pi_sim_${Date.now()}`;
        paymobOrderId = Math.floor(10000000 + Math.random() * 89999999);
        clientSecret = `egy_csk_test_sim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      } else if (!legacyRequested && this.legacyCheckoutReady) {
        // Unified Checkout refused (e.g. keys not linked to the integrations yet): fall back to
        // the card iframe so customers can still pay; the webhook confirms it the same way.
        this.logger.warn(
          `Unified Checkout failed (${(error as Error).message.slice(0, 160)}). Falling back to the card iframe.`,
        );
        return this.createPaymobLegacyCheckout(effectiveParams);
      } else {
        this.logger.error(
          `Paymob Unified Checkout error: ${(error as Error).message}`,
        );
        throw new BadRequestException(
          `Failed to create Paymob payment checkout: ${(error as Error).message}`,
        );
      }
    }

    // Egypt's hosted Unified Checkout page (override with PAYMOB_CHECKOUT_URL if Paymob changes it)
    const checkoutBase = (
      this.configService.get<string>('PAYMOB_CHECKOUT_URL') || 'https://eg.checkout.paymob.com/'
    ).trim();
    const checkoutUrl = `${checkoutBase}?publicKey=${encodeURIComponent(
      this.publicKey,
    )}&clientSecret=${encodeURIComponent(clientSecret)}`;

    const payment = await this.paymentRepository.create({
      userId:
        params.userId && Types.ObjectId.isValid(params.userId)
          ? new Types.ObjectId(params.userId)
          : null,
      guestSessionId: params.guestSessionId ?? null,
      orderReference: params.orderNumber,
      provider: PaymentProvider.PAYMOB,
      method: params.paymentMethod ?? PaymentMethod.PAYMOB_CARD,
      status: PaymentStatus.PENDING,
      amountCents: params.amountCents,
      currency,
      paymobIntentionId,
      paymobOrderId,
      clientSecret,
      checkoutUrl,
      billingData: { ...params.billingData },
    });

    return {
      paymentId: payment.id,
      paymobIntentionId,
      paymobOrderId,
      clientSecret,
      checkoutUrl,
    };
  }

  /**
   * Direct payment initiation endpoint (POST /api/v1/payments/paymob/initiate)
   */
  async initiatePaymobCheckout(
    dto: InitiatePaymentDto,
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<{
    paymentId: string;
    orderReference: string;
    paymobIntentionId: string;
    paymobOrderId: number;
    checkoutUrl: string;
    clientSecret: string;
    status: PaymentStatus;
    customerId: string;
  }> {
    let customerId = user?.sub;

    if (!customerId) {
      const guestCustomer = await this.authService.resolveOrCreateGuestCustomer(
        {
          fullName: `${dto.billingData.first_name} ${dto.billingData.last_name}`.trim(),
          email: dto.billingData.email,
          phone: dto.billingData.phone_number,
          guestSessionId,
          shippingAddress: {
            city: dto.billingData.city || 'Cairo',
            street: dto.billingData.street || 'NA',
            building: dto.billingData.building || 'NA',
            floor: dto.billingData.floor || 'NA',
            apartment: dto.billingData.apartment || 'NA',
          },
        },
        guestSessionId,
      );
      customerId = guestCustomer.id;
    }

    const idempotencyKey = `payment:init:${customerId}:${dto.orderReference}`;
    const existingCached = await this.cacheService.get<{
      paymentId: string;
      orderReference: string;
      paymobIntentionId: string;
      paymobOrderId: number;
      checkoutUrl: string;
      clientSecret: string;
      status: PaymentStatus;
      customerId: string;
    }>(idempotencyKey);

    if (existingCached) {
      return existingCached;
    }

    const intention = await this.createPaymobIntention({
      orderNumber: dto.orderReference,
      amountCents: dto.amountCents,
      currency: dto.currency,
      userId: customerId,
      guestSessionId,
      paymentMethods: dto.paymentMethods,
      billingData: dto.billingData,
    });

    const response = {
      paymentId: intention.paymentId,
      orderReference: dto.orderReference,
      paymobIntentionId: intention.paymobIntentionId,
      paymobOrderId: intention.paymobOrderId,
      checkoutUrl: intention.checkoutUrl,
      clientSecret: intention.clientSecret,
      status: PaymentStatus.PENDING,
      customerId,
    };

    await this.cacheService.set(idempotencyKey, response, 600);
    return response;
  }

  /**
   * Process and verify Paymob Transaction Callback Webhook using HMAC-SHA512
   * Synchronizes Order status (PAID), decrements inventory, clears cart, and dispatches invoice email.
   */
  async handlePaymobWebhook(
    webhookDto: PaymobWebhookDto,
    hmacSignature: string,
  ): Promise<{
    received: boolean;
    status: PaymentStatus;
    orderNumber?: string;
  }> {
    if (!hmacSignature) {
      throw new UnauthorizedException('Missing Paymob HMAC signature');
    }

    if (webhookDto.type && webhookDto.type !== 'TRANSACTION') {
      // e.g. "TOKEN" (saved card): nothing to update, acknowledge so Paymob stops retrying
      return { received: true, status: PaymentStatus.PENDING };
    }

    const tx = webhookDto.obj;
    if (!tx || !tx.order?.id) {
      throw new BadRequestException('Malformed Paymob webhook payload');
    }

    const concatenatedString = this.buildPaymobHmacConcatenatedString(tx);
    const isHmacValid = this.securityService.verifyHmacSha512(
      concatenatedString,
      this.hmacSecret,
      hmacSignature,
    );

    if (!isHmacValid) {
      this.logger.warn(
        `Invalid Paymob HMAC signature for Paymob Order #${tx.order.id}`,
      );
      throw new UnauthorizedException('Invalid Paymob webhook HMAC signature');
    }

    const merchantOrderNumber = tx.order.merchant_order_id;
    let payment = await this.paymentRepository.findByPaymobOrderId(tx.order.id);
    if (!payment && merchantOrderNumber) {
      payment =
        await this.paymentRepository.findByOrderReference(merchantOrderNumber);
    }

    const isSuccess = Boolean(tx.success && !tx.pending && !tx.error_occured);
    const newStatus = isSuccess
      ? PaymentStatus.SUCCESS
      : tx.is_refunded
        ? PaymentStatus.REFUNDED
        : tx.is_voided
          ? PaymentStatus.VOIDED
          : PaymentStatus.FAILED;

    if (payment && payment.status !== PaymentStatus.REFUNDED) {
      await this.paymentRepository.findByIdAndUpdate(payment.id, {
        $set: {
          status: newStatus,
          paymobTransactionId: tx.id,
          webhookVerified: true,
          paidAt: isSuccess ? new Date() : null,
          failureReason:
            newStatus === PaymentStatus.FAILED
              ? tx.data?.message || 'Transaction declined by issuer'
              : null,
        },
      });
    }

    const resolvedOrderNumber =
      merchantOrderNumber || payment?.orderReference || undefined;

    if (isSuccess) {
      await this.orderService.confirmOrderFromPaymobWebhook({
        orderNumber: resolvedOrderNumber,
        paymobOrderId: tx.order.id,
        transactionId: tx.id,
        amountCents: Number(tx.amount_cents),
        currency: tx.currency,
      });
    } else if (newStatus === PaymentStatus.REFUNDED && resolvedOrderNumber) {
      try {
        await this.orderService.refundOrder(
          resolvedOrderNumber,
          'Refund confirmed via Paymob webhook',
          undefined,
          { refundedAtGateway: true },
        );
      } catch (error) {
        // Acknowledge the webhook anyway so Paymob stops retrying; log for manual review
        this.logger.warn(
          `Refund webhook for ${resolvedOrderNumber} not applied: ${(error as Error).message}`,
        );
      }
    }

    return {
      received: true,
      status: newStatus,
      orderNumber: resolvedOrderNumber,
    };
  }

  /**
   * Admin Refund Handler (POST /api/v1/payments/paymob/refund)
   * Refunds a PAID order, updates Payment & Order status to REFUNDED, restores product stock, and sends refund email
   */
  async refundPaymobOrder(
    dto: { orderNumber?: string; orderId?: string; reason?: string },
    staffUserId?: string,
  ) {
    const identifier = dto.orderNumber || dto.orderId;
    if (!identifier) {
      throw new BadRequestException(
        'Either "orderNumber" or "orderId" is required to process a refund',
      );
    }

    const refundedOrder = await this.orderService.refundOrder(
      identifier,
      dto.reason,
      staffUserId,
    );

    const payment = await this.paymentRepository.findByOrderReference(
      refundedOrder.orderNumber,
    );
    if (payment) {
      await this.paymentRepository.findByIdAndUpdate(payment.id, {
        $set: {
          status: PaymentStatus.REFUNDED,
        },
      });
    }

    return {
      refunded: true,
      orderNumber: refundedOrder.orderNumber,
      orderStatus: refundedOrder.status,
      paymentStatus: refundedOrder.paymentStatus,
      refundedAmountCents: refundedOrder.totalCents,
      order: refundedOrder,
    };
  }

  /**
   * Refund a captured Paymob transaction. Throws if the gateway refuses, so the caller
   * can keep the order in its paid state.
   */
  async refundAtGateway(orderReference: string, amountCents: number): Promise<void> {
    const payment = await this.paymentRepository.findByOrderReference(orderReference);
    const transactionId = payment?.paymobTransactionId;
    if (!transactionId) {
      throw new BadRequestException(
        `No captured Paymob transaction recorded for order "${orderReference}"; refund it from the Paymob dashboard`,
      );
    }

    let response: Response;
    if (this.secretKey) {
      response = await fetch(
        'https://accept.paymob.com/api/acceptance/void_refund/refund',
        {
          method: 'POST',
          headers: {
            Authorization: `Token ${this.secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transaction_id: transactionId,
            amount_cents: amountCents,
          }),
        },
      );
    } else if (this.apiKey) {
      const authRes = await fetch('https://accept.paymob.com/api/auth/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: this.apiKey }),
      });
      if (!authRes.ok) {
        throw new BadRequestException(
          `Paymob authentication failed (${authRes.status})`,
        );
      }
      const { token } = (await authRes.json()) as { token: string };
      response = await fetch(
        'https://accept.paymob.com/api/acceptance/void_refund/refund',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auth_token: token,
            transaction_id: transactionId,
            amount_cents: amountCents,
          }),
        },
      );
    } else {
      throw new InternalServerErrorException('Paymob credentials are not configured');
    }

    const body = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      detail?: string;
      message?: string;
    };
    if (!response.ok || body.success === false) {
      this.logger.error(
        `Paymob refund failed for ${orderReference} (txn ${transactionId}): ${response.status} ${body.detail || body.message || ''}`,
      );
      throw new BadRequestException(
        `Paymob rejected the refund: ${body.detail || body.message || response.status}`,
      );
    }

    if (payment) {
      await this.paymentRepository.findByIdAndUpdate(payment.id, {
        $set: { status: PaymentStatus.REFUNDED },
      });
    }
  }

  async getPaymentByOrderReference(
    orderReference: string,
  ): Promise<PaymentDocument> {
    const payment =
      await this.paymentRepository.findByOrderReference(orderReference);
    if (!payment) {
      throw new NotFoundException(
        `Payment for order "${orderReference}" not found`,
      );
    }
    return payment;
  }

  public buildPaymobHmacConcatenatedString(tx: IPaymobTransactionObj): string {
    return [
      tx.amount_cents,
      tx.created_at,
      tx.currency,
      tx.error_occured,
      tx.has_parent_transaction,
      tx.id,
      tx.integration_id,
      tx.is_3d_secure,
      tx.is_auth,
      tx.is_capture,
      tx.is_refunded,
      tx.is_standalone_payment,
      tx.is_voided,
      tx.order?.id,
      tx.owner,
      tx.pending,
      tx.source_data?.pan,
      tx.source_data?.sub_type,
      tx.source_data?.type,
      tx.success,
    ]
      .map((val) => (val === undefined || val === null ? '' : String(val)))
      .join('');
  }
}
