import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { ICoupon } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    const payload: Record<string, unknown> = {};
    for (const key of [
      'code',
      'discountType',
      'discountValue',
      'minOrderAmountCents',
      'maxDiscountAmountCents',
      'startDate',
      'endDate',
      'usageLimit',
      'allowedEmails',
      'isActive',
    ]) {
      if (body[key] !== undefined) {
        payload[key] = body[key];
      }
    }

    const updated = await nestFetch<ICoupon>(
      `/coupons/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: payload,
        nestToken: auth.nestToken,
      },
    );

    revalidatePath('/admin');

    return NextResponse.json({
      success: true,
      data: updated.data,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const removed = await nestFetch<{ message: string }>(
      `/coupons/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        nestToken: auth.nestToken,
      },
    );

    revalidatePath('/admin');

    return NextResponse.json({
      success: true,
      data: removed.data,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
