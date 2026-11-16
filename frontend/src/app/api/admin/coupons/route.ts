import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { ICoupon } from '@/lib/types';

export async function GET() {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const res = await nestFetch<ICoupon[]>('/coupons?limit=100', {
      nestToken: auth.nestToken,
    });
    return NextResponse.json({
      success: true,
      data: res.data || [],
      meta: res.meta,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const body = (await request.json()) as {
      code?: string;
      discountType?: string;
      discountValue?: number;
      minOrderAmountCents?: number;
      maxDiscountAmountCents?: number;
      startDate?: string;
      endDate?: string;
      usageLimit?: number;
      allowedEmails?: string[];
      isActive?: boolean;
    };

    const payload: Record<string, unknown> = {
      code: String(body.code || '').trim().toUpperCase(),
      discountType: body.discountType || 'PERCENTAGE',
      discountValue: Math.round(Number(body.discountValue || 0)),
      minOrderAmountCents: Math.max(
        0,
        Math.round(Number(body.minOrderAmountCents || 0)),
      ),
      startDate: body.startDate || new Date().toISOString(),
      endDate:
        body.endDate ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      usageLimit: Math.max(1, Math.round(Number(body.usageLimit || 100))),
      isActive: body.isActive ?? true,
    };

    if (body.maxDiscountAmountCents && Number(body.maxDiscountAmountCents) > 0) {
      payload.maxDiscountAmountCents = Math.round(
        Number(body.maxDiscountAmountCents),
      );
    }
    if (Array.isArray(body.allowedEmails) && body.allowedEmails.length > 0) {
      payload.allowedEmails = body.allowedEmails;
    }

    const created = await nestFetch<ICoupon>('/coupons', {
      method: 'POST',
      body: payload,
      nestToken: auth.nestToken,
    });

    revalidatePath('/admin');

    return NextResponse.json(
      {
        success: true,
        data: created.data,
        message: 'Coupon created',
      },
      { status: 201 },
    );
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
