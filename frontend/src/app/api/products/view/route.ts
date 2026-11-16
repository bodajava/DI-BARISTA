import { NextRequest, NextResponse } from 'next/server';
import { existingGuestSessionId } from '@/lib/cart-route';
import { nestFetch } from '@/lib/nest-client';

const SLUG = /^[a-z0-9-]{1,120}$/;

/** POST { slug }: counts one product view (the API ignores repeats from the same visitor) */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { slug?: string } | null;
  const slug = String(body?.slug || '');
  if (!SLUG.test(slug)) return NextResponse.json({ success: false }, { status: 400 });
  try {
    await nestFetch(`/products/${encodeURIComponent(slug)}`, {
      request,
      guestSessionId: await existingGuestSessionId(),
      cache: 'no-store',
    });
  } catch {
    // analytics only: never surface errors to the shopper
  }
  return new NextResponse(null, { status: 204 });
}
