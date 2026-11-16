import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { IPaymobTransactionLike, verifyPaymobWebhookHmac } from '@/lib/paymob';

export async function POST(request: NextRequest) {
  try {
    const hmac = request.nextUrl.searchParams.get('hmac') || '';
    const body = (await request.json()) as {
      type?: string;
      obj?: IPaymobTransactionLike;
      hmac?: string;
    };

    const effectiveHmac = hmac || body.hmac || '';
    if (!verifyPaymobWebhookHmac(body.obj, effectiveHmac)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid Paymob HMAC signature',
        },
        { status: 401 },
      );
    }

    const forwarded = await nestFetch<{
      received: boolean;
      status: string;
      transactionId?: number;
      orderNumber?: string;
    }>(`/payments/paymob/webhook?hmac=${encodeURIComponent(effectiveHmac)}`, {
      method: 'POST',
      body: {
        type: body.type || 'TRANSACTION',
        obj: body.obj,
      },
    });

    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/track-order');

    return NextResponse.json({
      success: true,
      data: forwarded.data,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const orderNumber =
    sp.get('merchant_order_id') || sp.get('special_reference') || '';
  const success = sp.get('success') === 'true';
  const txnId = sp.get('id') || '';

  const dest = new URL('/track-order', request.url);
  if (orderNumber) dest.searchParams.set('order', orderNumber);
  dest.searchParams.set('payment', success ? 'success' : 'failed');
  if (txnId) dest.searchParams.set('txn', txnId);

  return NextResponse.redirect(dest);
}
