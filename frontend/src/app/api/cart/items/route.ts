import { NextRequest, NextResponse } from 'next/server';
import { cartCall, clampQuantity } from '@/lib/cart-route';
import type { GrindType } from '@/lib/types';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    productId?: string;
    quantity?: number;
    selectedGrind?: GrindType;
    variantLabel?: string;
  } | null;

  if (!body?.productId || !/^[0-9a-f]{24}$/i.test(body.productId)) {
    return NextResponse.json(
      { success: false, error: 'A valid productId is required' },
      { status: 400 },
    );
  }

  const payload: Record<string, unknown> = {
    productId: body.productId,
    quantity: clampQuantity(body.quantity),
  };
  if (body.selectedGrind) payload.selectedGrind = body.selectedGrind;
  if (body.variantLabel) payload.variantLabel = body.variantLabel;

  return cartCall(request, '/cart/items', { method: 'POST', body: payload });
}
