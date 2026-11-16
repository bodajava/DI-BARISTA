import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { IOrder } from '@/lib/types';

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const forward = new URLSearchParams();
    for (const key of ['page', 'limit', 'status', 'paymentMethod', 'search', 'sort']) {
      const val = sp.get(key);
      if (val !== null && val !== '') forward.set(key, val);
    }
    if (!forward.has('limit')) forward.set('limit', '50');
    if (!forward.has('sort')) forward.set('sort', '-createdAt');

    const res = await nestFetch<IOrder[]>(`/orders?${forward.toString()}`, {
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
