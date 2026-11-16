import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { createHmac, randomUUID } from 'crypto';
import { Connection } from 'mongoose';
import { AppModule } from '../src/app.module';
import {
  GrindType,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from '../src/common/enums';
import { TransformResponseInterceptor } from '../src/common/interceptors';
import { EmailService } from '../src/common/utilities/emails';
import {
  OrderRepository,
  ProductRepository,
} from '../src/models/repositories';
import { IPaymobTransactionObj } from '../src/modules/payment/dto';
import { PaymentService } from '../src/modules/payment/payment.service';

interface IProductCatalogItem {
  _id?: string;
  id?: string;
  name: string;
  sku: string;
  stock: number;
  finalPriceCents: number;
  availableGrinds: GrindType[];
}

function assertCondition(condition: unknown, message: string): void {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    throw new Error(`[ASSERTION FAILED] ${message}`);
  }
}

export async function runPurchaseAndRefundE2E(): Promise<void> {
  console.log('\n============================================================');
  console.log('☕️ DIBARESTA CAFFE — E2E Purchase & Refund Lifecycle Suite');
  console.log('============================================================\n');

  const app = await NestFactory.create(AppModule, {
    logger: ['error'],
  });

  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalInterceptors(new TransformResponseInterceptor());

  // Prevent external SMTP network latency during E2E run while tracking email dispatches
  const emailService = app.get(EmailService);
  const dispatchedEmails: Array<{ to: unknown; subject?: string }> = [];
  emailService.sendEmail = async (opts) => {
    dispatchedEmails.push({ to: opts.to, subject: opts.subject });
  };

  await app.listen(0);
  const serverAddress = app.getHttpServer().address();
  const port =
    typeof serverAddress === 'object' && serverAddress
      ? serverAddress.port
      : 3001;
  const baseUrl = `http://127.0.0.1:${port}/${apiPrefix}`;

  const orderRepository = app.get(OrderRepository);
  const productRepository = app.get(ProductRepository);
  const paymentService = app.get(PaymentService);

  try {
    // =========================================================================
    // PHASE 1: Guest Browsing & Cart Addition
    // =========================================================================
    const testStoreRes = await fetch(`${baseUrl}/test-store`);
    const testStoreHtml = await testStoreRes.text();
    assertCondition(
      testStoreRes.status === 200 &&
        testStoreHtml.includes('DIBARESTA CAFFE — Live Testing Playground'),
      'Expected GET /api/v1/test-store to return the HTML testbed playground',
    );

    const guestSessionId = `guest_${randomUUID()}`;
    console.log(
      `🔹 [Phase 1] Generated Guest Session ID: ${guestSessionId}`,
    );

    const productsRes = await fetch(`${baseUrl}/products`);
    const productsBody = (await productsRes.json()) as {
      success: boolean;
      data: IProductCatalogItem[] | { docs: IProductCatalogItem[] };
    };

    const productList: IProductCatalogItem[] = Array.isArray(productsBody.data)
      ? productsBody.data
      : productsBody.data?.docs || [];

    assertCondition(
      productsRes.ok && productList.length > 0,
      'Phase 1: GET /api/v1/products returned active coffee catalog',
    );

    const targetProduct = productList.find((p) => p.stock >= 5)!;
    assertCondition(
      Boolean(targetProduct),
      'Phase 1: Found an active coffee product with sufficient stock',
    );

    const productId = String(targetProduct.id || targetProduct._id);
    const initialStock = targetProduct.stock;
    const purchaseQuantity = 2;
    const selectedGrind =
      targetProduct.availableGrinds?.[0] || GrindType.FILTER_V60;

    console.log(
      `   Selected Coffee: "${targetProduct.name}" (SKU: ${targetProduct.sku}) | Initial Stock: ${initialStock} | Unit Price: ${targetProduct.finalPriceCents} cents`,
    );

    const addCartRes = await fetch(`${baseUrl}/cart/items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guest-session-id': guestSessionId,
      },
      body: JSON.stringify({
        productId,
        quantity: purchaseQuantity,
        selectedGrind,
      }),
    });
    assertCondition(
      addCartRes.ok,
      `Phase 1: POST /api/v1/cart/items succeeded (HTTP ${addCartRes.status})`,
    );

    const getCartRes = await fetch(`${baseUrl}/cart`, {
      headers: { 'x-guest-session-id': guestSessionId },
    });
    const getCartBody = (await getCartRes.json()) as {
      data: {
        items: Array<{ productId: string; quantity: number }>;
        subTotalCents: number;
      };
    };

    const expectedSubTotal = targetProduct.finalPriceCents * purchaseQuantity;
    assertCondition(
      getCartBody.data.items.length === 1 &&
        getCartBody.data.items[0].quantity === purchaseQuantity &&
        getCartBody.data.subTotalCents === expectedSubTotal,
      `Phase 1: GET /api/v1/cart verified ${purchaseQuantity} item(s) and subTotalCents = ${expectedSubTotal}`,
    );
    console.log(
      `✅ [PASS] Phase 1: Guest Browsing & Cart Addition (Items: ${getCartBody.data.items.length}, Qty: ${purchaseQuantity}, subTotalCents: ${getCartBody.data.subTotalCents})\n`,
    );

    // =========================================================================
    // PHASE 2: Checkout & Order Creation
    // =========================================================================
    console.log('🔹 [Phase 2] Initiating Guest Checkout with PAYMOB_CARD...');
    const checkoutRes = await fetch(`${baseUrl}/orders/checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-guest-session-id': guestSessionId,
      },
      body: JSON.stringify({
        customerName: 'Tarek El-Masry',
        customerEmail: 'tarek.e2e@dibarestacaffe.com',
        customerPhone: '+201098765432',
        shippingAddress: {
          street: '24 Brazil Street',
          city: 'Zamalek, Cairo',
          building: '10A',
          floor: '3',
          apartment: '32',
        },
        paymentMethod: PaymentMethod.PAYMOB_CARD,
        notes: 'E2E automated checkout test',
      }),
    });

    const checkoutBody = (await checkoutRes.json()) as {
      data: {
        orderNumber: string;
        totalCents: number;
        checkoutUrl: string;
        clientSecret: string;
      };
    };

    assertCondition(
      checkoutRes.ok &&
        Boolean(checkoutBody.data?.orderNumber) &&
        checkoutBody.data?.totalCents > 0 &&
        Boolean(checkoutBody.data?.checkoutUrl) &&
        Boolean(checkoutBody.data?.clientSecret),
      'Phase 2: POST /api/v1/orders/checkout returned orderNumber, totalCents, checkoutUrl, and clientSecret',
    );

    const { orderNumber, totalCents, checkoutUrl, clientSecret } =
      checkoutBody.data;
    const orderInDbAfterCheckout =
      await orderRepository.findByOrderNumber(orderNumber);

    assertCondition(
      Boolean(orderInDbAfterCheckout) &&
        orderInDbAfterCheckout!.status === OrderStatus.PENDING_PAYMENT &&
        orderInDbAfterCheckout!.paymentStatus === PaymentStatus.INITIATED,
      `Phase 2: Order ${orderNumber} persisted in MongoDB with status=PENDING_PAYMENT and paymentStatus=INITIATED`,
    );

    console.log(
      `✅ [PASS] Phase 2: Checkout & Order Creation (Order: ${orderNumber}, Total: ${totalCents} cents, Status: ${orderInDbAfterCheckout!.status}, PaymentStatus: ${orderInDbAfterCheckout!.paymentStatus})`,
    );
    console.log(`   Paymob Checkout URL: ${checkoutUrl.slice(0, 80)}...`);
    console.log(`   Client Secret: ${clientSecret}\n`);

    // =========================================================================
    // PHASE 3: Paymob Webhook Simulation (Payment Success)
    // =========================================================================
    console.log(
      '🔹 [Phase 3] Simulating HMAC-SHA512 Signed Paymob Webhook Callback...',
    );

    const paymobOrderId =
      orderInDbAfterCheckout!.paymobOrderId || 98765432;
    const txPayload: IPaymobTransactionObj = {
      id: 778899001,
      pending: false,
      amount_cents: totalCents,
      success: true,
      is_auth: false,
      is_capture: false,
      is_standalone_payment: true,
      is_voided: false,
      is_refunded: false,
      is_3d_secure: true,
      integration_id: 445566,
      has_parent_transaction: false,
      order: {
        id: paymobOrderId,
        merchant_order_id: orderNumber,
      },
      created_at: new Date().toISOString(),
      currency: 'EGP',
      error_occured: false,
      owner: 112233,
      source_data: {
        pan: '4242',
        type: 'card',
        sub_type: 'Visa',
      },
    };

    const hmacSecret = configService.get<string>('PAYMOB_HMAC_SECRET', '');
    const concatenated =
      paymentService.buildPaymobHmacConcatenatedString(txPayload);
    const computedHmac = createHmac('sha512', hmacSecret)
      .update(concatenated)
      .digest('hex');

    const webhookRes = await fetch(
      `${baseUrl}/payments/paymob/webhook?hmac=${computedHmac}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'TRANSACTION',
          obj: txPayload,
        }),
      },
    );

    assertCondition(
      webhookRes.ok,
      `Phase 3: POST /api/v1/payments/paymob/webhook succeeded (HTTP ${webhookRes.status})`,
    );

    const orderAfterWebhook =
      await orderRepository.findByOrderNumber(orderNumber);
    const productAfterWebhook = await productRepository.findById(productId);
    const cartAfterWebhookRes = await fetch(`${baseUrl}/cart`, {
      headers: { 'x-guest-session-id': guestSessionId },
    });
    const cartAfterWebhookBody = (await cartAfterWebhookRes.json()) as {
      data: { items: unknown[]; subTotalCents: number };
    };

    assertCondition(
      orderAfterWebhook?.status === OrderStatus.PAID &&
        orderAfterWebhook?.paymentStatus === PaymentStatus.SUCCESS,
      `Phase 3: Order transitioned to status=PAID and paymentStatus=SUCCESS`,
    );
    assertCondition(
      productAfterWebhook?.stock === initialStock - purchaseQuantity,
      `Phase 3: Product stock decremented from ${initialStock} to ${productAfterWebhook?.stock}`,
    );
    assertCondition(
      cartAfterWebhookBody.data.items.length === 0,
      'Phase 3: Guest cart was automatically cleared upon payment confirmation',
    );

    console.log(
      `✅ [PASS] Phase 3: Paymob Webhook Confirmation (Order: ${orderAfterWebhook!.status}/${orderAfterWebhook!.paymentStatus}, Stock: ${initialStock} -> ${productAfterWebhook!.stock}, Cart Items: ${cartAfterWebhookBody.data.items.length})\n`,
    );

    // =========================================================================
    // PHASE 4: Order Refund Simulation
    // =========================================================================
    console.log(
      '🔹 [Phase 4] Authenticating as Super Admin & Triggering Order Refund...',
    );

    const adminEmail = configService.get<string>(
      'SUPER_ADMIN_EMAIL',
      'admin@dibarestacaffe.com',
    );
    const adminPassword = configService.get<string>(
      'SUPER_ADMIN_PASSWORD',
      'Admin@123456',
    );

    const adminLoginRes = await fetch(`${baseUrl}/auth/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: adminEmail,
        password: adminPassword,
      }),
    });
    const adminLoginBody = (await adminLoginRes.json()) as {
      data: { tokens: { accessToken: string } };
    };

    assertCondition(
      adminLoginRes.ok && Boolean(adminLoginBody.data?.tokens?.accessToken),
      'Phase 4: Super Admin login succeeded and returned system accessToken',
    );

    const adminToken = adminLoginBody.data.tokens.accessToken;

    const refundRes = await fetch(`${baseUrl}/payments/paymob/refund`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        orderNumber,
        reason: 'Customer requested cancellation & full refund in E2E test',
      }),
    });
    const refundBody = (await refundRes.json()) as {
      data: {
        refunded: boolean;
        orderNumber: string;
        orderStatus: OrderStatus;
        paymentStatus: PaymentStatus;
      };
    };

    assertCondition(
      refundRes.ok && refundBody.data?.refunded === true,
      `Phase 4: POST /api/v1/payments/paymob/refund succeeded (HTTP ${refundRes.status})`,
    );

    const orderAfterRefund =
      await orderRepository.findByOrderNumber(orderNumber);
    const productAfterRefund = await productRepository.findById(productId);

    assertCondition(
      orderAfterRefund?.status === OrderStatus.REFUNDED &&
        orderAfterRefund?.paymentStatus === PaymentStatus.REFUNDED,
      `Phase 4: Order status in DB is now REFUNDED (status=${orderAfterRefund?.status}, paymentStatus=${orderAfterRefund?.paymentStatus})`,
    );
    assertCondition(
      productAfterRefund?.stock === initialStock,
      `Phase 4: Product inventory restored back to initial quantity (${productAfterRefund?.stock} === ${initialStock})`,
    );
    assertCondition(
      dispatchedEmails.some((e) =>
        String(e.subject || '').includes('Refund Processed'),
      ),
      'Phase 4: Customer refund notification email was dispatched',
    );

    console.log(
      `✅ [PASS] Phase 4: Order Refund Simulation (Order Status: ${orderAfterRefund!.status}, Payment Status: ${orderAfterRefund!.paymentStatus}, Restored Stock: ${productAfterRefund!.stock}/${initialStock})\n`,
    );

    console.log('============================================================');
    console.log('🎉 ALL 4 E2E PHASES PASSED CLEANLY WITH ZERO ERRORS!');
    console.log('============================================================\n');
  } finally {
    const connection = app.get<Connection>(getConnectionToken());
    await connection.close().catch(() => undefined);
    await app.close();
  }
}

if (require.main === module) {
  runPurchaseAndRefundE2E().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
