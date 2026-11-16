import { NextRequest } from 'next/server';
import { cartCall, clampQuantity } from '@/lib/cart-route';

type RouteContext = { params: Promise<{ itemId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { itemId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { quantity?: number };
  return cartCall(request, `/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    body: { quantity: clampQuantity(body.quantity) },
  });
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { itemId } = await context.params;
  return cartCall(request, `/cart/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
  });
}
