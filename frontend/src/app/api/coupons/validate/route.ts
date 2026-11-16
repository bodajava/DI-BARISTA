import { NextRequest, NextResponse } from 'next/server';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { ICouponValidationResult } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      code?: string;
      subTotalCents?: number;
      email?: string;
    };

    const code = (body.code || '').trim();
    const subTotalCents = Math.round(Number(body.subTotalCents || 0));

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Promo code is required' },
        { status: 400 },
      );
    }
    if (subTotalCents < 1) {
      return NextResponse.json(
        { success: false, error: 'Cart subtotal must be greater than zero' },
        { status: 400 },
      );
    }

    const payload: Record<string, unknown> = {
      code,
      subTotalCents,
    };
    if (body.email && body.email.trim()) {
      payload.email = body.email.trim();
    }

    const result = await nestFetch<ICouponValidationResult>('/coupons/validate', {
      request,
      method: 'POST',
      body: payload,
    });

    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
