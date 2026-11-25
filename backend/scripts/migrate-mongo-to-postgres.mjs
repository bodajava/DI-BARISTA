/**
 * One-off copy of the store data from MongoDB to PostgreSQL.
 *
 *   MONGO_URL="mongodb+srv://…" MONGO_DB=dibaresta_caffe DATABASE_URL="postgresql://…" \
 *     node scripts/migrate-mongo-to-postgres.mjs [--reset]
 *
 * Mongo ids are kept as the new primary keys, so every reference (and any link that contains
 * an id) keeps working. Old order statuses are mapped onto the new status machine.
 * --reset empties the PostgreSQL tables first. Carts are not copied (they are temporary).
 */
import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';

const MONGO_URL = process.env.MONGO_URL;
const MONGO_DB = process.env.MONGO_DB || 'dibaresta_caffe';
if (!MONGO_URL || !process.env.DATABASE_URL) {
  console.error('Set MONGO_URL and DATABASE_URL');
  process.exit(1);
}

const prisma = new PrismaClient();
const mongo = new MongoClient(MONGO_URL);
const id = (v) => (v ? String(v) : null);
const date = (v) => (v ? new Date(v) : undefined);
const str = (v) => (v === undefined || v === null || v === '' ? null : String(v));

const ORDER_STATUS = {
  PENDING_PAYMENT: 'PENDING_PAYMENT', PENDING: 'PENDING_PAYMENT', PLACED: 'PENDING_PAYMENT',
  PAID: 'CONFIRMED', PROCESSING: 'CONFIRMED', CONFIRMED: 'CONFIRMED',
  ROASTING: 'PREPARING', ROASTING_AND_PREPARING: 'PREPARING', PACKING: 'PREPARING',
  SHIPPED: 'SHIPPED', ON_WAY: 'SHIPPED', OUT_FOR_DELIVERY: 'SHIPPED',
  DELIVERED: 'DELIVERED', CANCELLED: 'CANCELLED', REFUNDED: 'REFUNDED',
};
const METHOD = { PAYMOB_CARD: 'PAYMOB_CARD', CARD: 'PAYMOB_CARD', KIOSK: 'PAYMOB_CARD', MOBILE_WALLET: 'MOBILE_WALLET', CASH_ON_DELIVERY: 'CASH_ON_DELIVERY', CASH: 'CASH_ON_DELIVERY' };
function paymentStatus(raw, method, orderStatus) {
  if (['SUCCESS', 'CAPTURED', 'AUTHORIZED'].includes(raw)) return 'PAID';
  if (raw === 'REFUNDED') return 'REFUNDED';
  if (['FAILED', 'VOIDED'].includes(raw)) return 'FAILED';
  if (method === 'CASH_ON_DELIVERY') return orderStatus === 'DELIVERED' ? 'PAID' : 'UNPAID';
  return orderStatus === 'CANCELLED' ? 'UNPAID' : 'PENDING';
}

async function main() {
  await mongo.connect();
  const db = mongo.db(MONGO_DB);
  const all = async (name) => db.collection(name).find({}).toArray();

  if (process.argv.includes('--reset')) {
    console.log('Emptying PostgreSQL tables…');
    await prisma.$executeRawUnsafe(`TRUNCATE order_status_history, order_items, coupon_usages, orders, payments,
      cart_items, carts, product_variants, product_views, stock_alerts, products, categories, brands, coupons,
      subscribers, contact_messages, addresses, audit_logs, notification_devices, users CASCADE`);
  }

  // Users (+ their saved address)
  const users = await all('users');
  for (const u of users) {
    const userId = id(u._id);
    await prisma.user.upsert({
      where: { id: userId },
      update: {},
      create: {
        id: userId,
        fullName: u.fullName || u.email,
        email: String(u.email).toLowerCase(),
        password: u.password ?? null,
        phoneEncrypted: u.phoneEncrypted ?? null,
        role: u.role === 'BARISTA' ? 'STAFF' : ['SUPER_ADMIN', 'ADMIN', 'CUSTOMER'].includes(u.role) ? u.role : 'CUSTOMER',
        isGuest: Boolean(u.isGuest),
        guestSessionId: u.guestSessionId ?? null,
        isEmailVerified: Boolean(u.isEmailVerified),
        isActive: u.isActive !== false,
        favoriteRoast: u.favoriteRoast ?? null,
        createdAt: date(u.createdAt),
        deletedAt: date(u.deletedAt) ?? null,
        ...(u.shippingAddress?.city
          ? { addresses: { create: { city: u.shippingAddress.city, street: u.shippingAddress.street || 'NA', building: u.shippingAddress.building || 'NA', floor: u.shippingAddress.floor || 'NA', apartment: u.shippingAddress.apartment || 'NA', notes: u.shippingAddress.notes ?? null, isDefault: true } } }
          : {}),
      },
    });
  }
  console.log(`users: ${users.length}`);

  // Brands & categories (deleted rows get a suffix so names stay unique)
  for (const [coll, model] of [['brands', prisma.brand], ['categories', prisma.category]]) {
    const docs = await all(coll);
    const seen = new Set();
    for (const d of docs) {
      let name = d.name;
      let slug = d.slug;
      if (seen.has(name.toLowerCase()) || d.deletedAt) {
        name = `${name}__deleted_${id(d._id).slice(-6)}`;
        slug = `${slug}--deleted-${id(d._id).slice(-6)}`;
      }
      seen.add(name.toLowerCase());
      const data = {
        id: id(d._id), name, nameAr: str(d.nameAr), slug, description: str(d.description),
        isActive: d.isActive !== false && !d.deletedAt, createdById: id(d.createdBy),
        createdAt: date(d.createdAt), deletedAt: date(d.deletedAt) ?? null,
        ...(coll === 'brands'
          ? { originCountry: str(d.originCountry), logoUrl: str(d.logoUrl), logoKey: str(d.logoKey) }
          : { imageUrl: str(d.imageUrl), imageKey: str(d.imageKey) }),
      };
      await model.upsert({ where: { id: data.id }, update: {}, create: data });
    }
    console.log(`${coll}: ${docs.length}`);
  }

  // Products (+ embedded variants → product_variants)
  const categoryIds = new Set((await prisma.category.findMany({ select: { id: true } })).map((c) => c.id));
  const brandIds = new Set((await prisma.brand.findMany({ select: { id: true } })).map((b) => b.id));
  let fallbackCategory = null;
  const products = await all('products');
  const productImage = new Map();
  for (const p of products) {
    let categoryId = id(p.categoryId);
    if (!categoryIds.has(categoryId)) {
      fallbackCategory ??= (await prisma.category.upsert({ where: { slug: 'other' }, update: {}, create: { name: 'Other', nameAr: 'أخرى', slug: 'other' } })).id;
      categoryId = fallbackCategory;
    }
    const productId = id(p._id);
    productImage.set(productId, p.imageUrls?.[0] ?? null);
    const extra = (p.categoryIds || []).map(id).filter((c) => c && c !== categoryId && categoryIds.has(c));
    await prisma.product.upsert({
      where: { id: productId },
      update: {},
      create: {
        id: productId,
        name: p.name_en || p.name,
        nameAr: str(p.name_ar || p.nameAr),
        slug: p.deletedAt ? `${p.slug}--deleted-${productId.slice(-6)}` : p.slug,
        sku: p.deletedAt ? `${p.sku}-DEL-${productId.slice(-6)}` : p.sku,
        description: str(p.description_en || p.description),
        descriptionAr: str(p.description_ar),
        brandId: brandIds.has(id(p.brandId)) ? id(p.brandId) : null,
        categoryId,
        extraCategoryIds: [...new Set(extra)],
        roastLevel: p.roastLevel || 'MEDIUM',
        availableGrinds: p.availableGrinds?.length ? p.availableGrinds : undefined,
        flavorNotes: p.tastingNotes_en?.length ? p.tastingNotes_en : p.flavorNotes || [],
        flavorNotesAr: p.tastingNotes_ar || [],
        originCountry: str(p.originCountry), originCountryAr: str(p.originCountryAr),
        elevation: str(p.elevation), elevationAr: str(p.elevationAr),
        processingMethod: str(p.processingMethod), processingMethodAr: str(p.processingMethodAr),
        weightGrams: p.weightGrams || 250,
        priceCents: p.priceCents,
        maxPriceCents: p.maxPriceCents ?? null,
        discountPercent: p.discountPercent || 0,
        finalPriceCents: p.finalPriceCents || p.priceCents,
        stock: Math.max(0, p.stock || 0),
        soldCount: p.soldCount || 0,
        viewsCount: p.viewsCount || 0,
        imageUrls: p.imageUrls || [],
        imageKeys: p.imageKeys || [],
        isFeatured: Boolean(p.isFeatured),
        isActive: p.isActive !== false && p.status !== 'DRAFT' && !p.deletedAt,
        createdById: id(p.createdBy),
        createdAt: date(p.createdAt),
        deletedAt: date(p.deletedAt) ?? null,
        variants: p.variants?.length
          ? { create: p.variants.map((v, i) => ({ label: v.label, labelAr: str(v.labelAr), priceCents: v.priceCents, weightGrams: v.weightGrams ?? null, capsulesCount: v.capsulesCount ?? null, position: i })) }
          : undefined,
      },
    });
  }
  console.log(`products: ${products.length}`);
  const variants = await prisma.productVariant.findMany({ select: { id: true, productId: true, label: true } });

  // Coupons
  const coupons = await all('coupons');
  for (const c of coupons) {
    await prisma.coupon.upsert({
      where: { id: id(c._id) },
      update: {},
      create: {
        id: id(c._id),
        code: c.deletedAt ? `${c.code}-DEL-${id(c._id).slice(-4)}` : c.code,
        discountType: c.discountType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FIXED_AMOUNT',
        discountValue: c.discountValue,
        minOrderAmountCents: c.minOrderAmountCents || 0,
        maxDiscountAmountCents: c.maxDiscountAmountCents ?? null,
        startDate: new Date(c.startDate),
        endDate: new Date(c.endDate),
        usageLimit: c.usageLimit ?? null,
        usedCount: c.usedCount || 0,
        allowedEmails: c.allowedEmails || [],
        isActive: c.isActive !== false && !c.deletedAt,
        createdById: id(c.createdBy),
        createdAt: date(c.createdAt),
        deletedAt: date(c.deletedAt) ?? null,
      },
    });
  }
  console.log(`coupons: ${coupons.length}`);

  // Orders (+ items, + one timeline entry)
  const userIds = new Set(users.map((u) => id(u._id)));
  const orders = await all('orders');
  for (const o of orders) {
    const method = METHOD[o.paymentMethod] || 'CASH_ON_DELIVERY';
    const status = ORDER_STATUS[o.status] || 'PENDING_PAYMENT';
    const pay = status === 'REFUNDED' ? 'REFUNDED' : paymentStatus(o.paymentStatus, method, status);
    const a = o.shippingAddress || {};
    await prisma.order.upsert({
      where: { id: id(o._id) },
      update: {},
      create: {
        id: id(o._id),
        orderNumber: o.orderNumber,
        userId: userIds.has(id(o.userId)) ? id(o.userId) : null,
        guestSessionId: o.guestSessionId ?? null,
        customerName: o.customerName,
        customerEmail: String(o.customerEmail).toLowerCase(),
        customerPhone: o.customerPhone || '',
        governorate: null,
        city: a.city || 'NA',
        street: a.street || 'NA',
        building: a.building || 'NA',
        floor: a.floor || 'NA',
        apartment: a.apartment || 'NA',
        postalCode: a.postalCode || 'NA',
        notes: o.notes ?? null,
        locale: o.locale === 'ar' ? 'ar' : 'en',
        subTotalCents: o.subTotalCents,
        discountCents: o.discountCents || 0,
        couponCode: o.couponCode ?? null,
        shippingFeeCents: o.shippingFeeCents ?? 0,
        totalCents: o.totalCents,
        refundedCents: status === 'REFUNDED' ? o.totalCents : 0,
        paymentMethod: method,
        paymentStatus: pay,
        status,
        paymobOrderId: o.paymobOrderId ?? null,
        intentionId: o.intentionId ?? null,
        handledByStaffId: userIds.has(id(o.handledByStaffId)) ? id(o.handledByStaffId) : null,
        createdAt: date(o.createdAt),
        deletedAt: date(o.deletedAt) ?? null,
        items: {
          create: (o.items || []).map((i) => {
            const pid = id(i.productId);
            const [base, label] = String(i.name).split(' — ');
            const variant = label ? variants.find((v) => v.productId === pid && v.label === label) : undefined;
            return {
              productId: productImage.has(pid) ? pid : null,
              variantId: variant?.id ?? null,
              sku: i.sku,
              name: label ? base : i.name,
              variantLabel: label ?? null,
              imageUrl: productImage.get(pid) ?? null,
              selectedGrind: i.selectedGrind || 'WHOLE_BEAN',
              unitPriceCents: i.unitPriceCents,
              quantity: i.quantity,
              lineTotalCents: i.lineTotalCents ?? i.unitPriceCents * i.quantity,
            };
          }),
        },
        statusHistory: { create: { toStatus: status, note: `Imported (was ${o.status})`, createdAt: date(o.updatedAt || o.createdAt) } },
      },
    });
  }
  console.log(`orders: ${orders.length}`);

  // Payments
  const payments = await all('payments');
  for (const p of payments) {
    const method = METHOD[p.method] || 'PAYMOB_CARD';
    await prisma.payment.upsert({
      where: { id: id(p._id) },
      update: {},
      create: {
        id: id(p._id),
        userId: id(p.userId),
        guestSessionId: p.guestSessionId ?? null,
        orderReference: p.orderReference,
        provider: p.provider || 'PAYMOB',
        method,
        status: paymentStatus(p.status, method, 'CONFIRMED'),
        amountCents: p.amountCents,
        currency: p.currency || 'EGP',
        paymobIntentionId: p.paymobIntentionId ?? null,
        paymobOrderId: p.paymobOrderId ?? null,
        paymobTransactionId: p.paymobTransactionId ?? null,
        checkoutUrl: p.checkoutUrl ?? null,
        billingData: p.billingData ?? {},
        webhookVerified: Boolean(p.webhookVerified),
        paidAt: date(p.paidAt) ?? null,
        failureReason: p.failureReason ?? null,
        createdAt: date(p.createdAt),
      },
    });
  }
  console.log(`payments: ${payments.length}`);

  // Newsletter & messages
  const subs = await all('subscribers');
  for (const s of subs) {
    await prisma.subscriber.upsert({
      where: { email: String(s.email).toLowerCase() },
      update: {},
      create: { id: id(s._id), email: String(s.email).toLowerCase(), locale: s.locale || 'en', source: s.source || 'home', isActive: s.isActive !== false, createdAt: date(s.createdAt), deletedAt: date(s.deletedAt) ?? null },
    });
  }
  const msgs = await all('contact_messages');
  for (const m of msgs) {
    await prisma.contactMessage.upsert({
      where: { id: id(m._id) },
      update: {},
      create: { id: id(m._id), email: m.email, name: m.name || '', message: m.message, locale: m.locale || 'en', status: m.status === 'NEW' ? 'NEW' : 'READ', createdAt: date(m.createdAt), deletedAt: date(m.deletedAt) ?? null },
    });
  }
  console.log(`subscribers: ${subs.length}, messages: ${msgs.length}`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongo.close();
    await prisma.$disconnect();
  });
