import { NextRequest, NextResponse } from 'next/server';
import { resolveGuestSessionId } from '@/lib/auth';
import { withGuestCookie } from '@/lib/cart-route';
import { GOVERNORATES, normalizeEgyptPhone } from '@/lib/egypt';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const METHODS = ['CASH_ON_DELIVERY', 'PAYMOB_CARD', 'MOBILE_WALLET'] as const;
/** Only ever send the shopper to Paymob's own hosted pages */
const PAYMOB_HOST = /^https:\/\/(accept|eg\.checkout)\.paymob\.com\//;

type Body = {
  name?: string;
  email?: string;
  phone?: string;
  governorate?: string;
  street?: string;
  building?: string;
  floor?: string;
  apartment?: string;
  notes?: string;
  couponCode?: string;
  paymentMethod?: string;
  locale?: string;
};

type CheckoutResult = {
  orderNumber: string;
  totalCents: number;
  checkoutUrl?: string;
};

const clip = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** POST /api/checkout: validates, then creates the order from the visitor's server-side cart */
export async function POST(request: NextRequest) {
  const body = ((await request.json().catch(() => null)) || {}) as Body;

  const name = clip(body.name, 100);
  const email = clip(body.email, 254).toLowerCase();
  const phone = normalizeEgyptPhone(clip(body.phone, 25));
  const governorate = GOVERNORATES.find((g) => g.en === body.governorate)?.en;
  const street = clip(body.street, 200);
  const building = clip(body.building, 60);
  const method = METHODS.find((m) => m === body.paymentMethod);

  const invalid = [
    name.length < 2 && 'name',
    !EMAIL.test(email) && 'email',
    !phone && 'phone',
    !governorate && 'governorate',
    !street && 'street',
    !building && 'building',
    !method && 'paymentMethod',
  ].filter(Boolean);
  if (invalid.length) {
    return NextResponse.json(
      { success: false, error: 'Invalid checkout details', fields: invalid },
      { status: 400 },
    );
  }

  try {
    const guestSessionId = await resolveGuestSessionId(request);
    const res = await nestFetch<CheckoutResult>('/orders/checkout', {
      method: 'POST',
      guestSessionId,
      request,
      body: {
        customerName: name,
        customerEmail: email,
        customerPhone: phone,
        shippingAddress: {
          city: governorate,
          street,
          building,
          floor: clip(body.floor, 30) || 'NA',
          apartment: clip(body.apartment, 30) || 'NA',
        },
        notes: clip(body.notes, 500) || undefined,
        couponCode: clip(body.couponCode, 32) || undefined,
        paymentMethod: method,
        locale: body.locale === 'ar' ? 'ar' : 'en',
      },
    });

    const checkoutUrl =
      res.data.checkoutUrl && PAYMOB_HOST.test(res.data.checkoutUrl)
        ? res.data.checkoutUrl
        : undefined;
    if (method !== 'CASH_ON_DELIVERY' && !checkoutUrl) {
      return NextResponse.json(
        { success: false, error: 'Payment could not be started', code: 'payment' },
        { status: 502 },
      );
    }

    return withGuestCookie(
      NextResponse.json({
        success: true,
        data: {
          orderNumber: res.data.orderNumber,
          totalCents: res.data.totalCents,
          checkoutUrl,
        },
      }),
      guestSessionId,
    );
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
