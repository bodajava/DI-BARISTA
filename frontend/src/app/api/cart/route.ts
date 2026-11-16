import { NextRequest, NextResponse } from 'next/server';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { EMPTY_CART, cartCall, existingGuestSessionId } from '@/lib/cart-route';
import type { ICart } from '@/lib/types';

export async function GET() {
  const guestSessionId = await existingGuestSessionId();
  // No cookie yet = nothing was ever added: answer locally instead of hitting the API
  if (!guestSessionId) {
    return NextResponse.json({ success: true, data: EMPTY_CART });
  }
  try {
    const result = await nestFetch<ICart>('/cart', { guestSessionId });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function DELETE(request: NextRequest) {
  return cartCall(request, '/cart', { method: 'DELETE' });
}
