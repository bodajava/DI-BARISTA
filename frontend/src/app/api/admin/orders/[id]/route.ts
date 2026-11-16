import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { IOrder, IOrderPaymentInfo } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const orderRes = await nestFetch<IOrder>(
      `/orders/${encodeURIComponent(id)}`,
      { nestToken: auth.nestToken },
    );

    let paymentInfo: IOrderPaymentInfo | null = null;
    if (orderRes.data?.orderNumber) {
      try {
        const payRes = await nestFetch<IOrderPaymentInfo>(
          `/payments/order/${encodeURIComponent(orderRes.data.orderNumber)}`,
          { nestToken: auth.nestToken },
        );
        paymentInfo = payRes.data || null;
      } catch {
        paymentInfo = null;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        order: orderRes.data,
        payment: paymentInfo,
      },
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { status?: string };
    if (!body.status) {
      return NextResponse.json(
        { success: false, error: 'status is required' },
        { status: 400 },
      );
    }

    const updated = await nestFetch<IOrder>(
      `/orders/${encodeURIComponent(id)}/status`,
      {
        method: 'PATCH',
        body: { status: body.status },
        nestToken: auth.nestToken,
      },
    );

    revalidatePath('/admin');
    revalidatePath('/track-order');

    return NextResponse.json({
      success: true,
      data: updated.data,
      message: 'Order status updated',
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      reason?: string;
    };

    const refunded = await nestFetch<IOrder>(
      `/orders/${encodeURIComponent(id)}/refund`,
      {
        method: 'PATCH',
        body: { reason: body.reason || 'Admin dashboard refund' },
        nestToken: auth.nestToken,
      },
    );

    revalidatePath('/');
    revalidatePath('/admin');
    revalidatePath('/track-order');

    return NextResponse.json({
      success: true,
      data: refunded.data,
      message: 'Order refunded & inventory restored',
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
