import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { GUEST_SESSION_COOKIE, resolveGuestSessionId } from '@/lib/auth';
import { errorJsonResponse, nestFetch, type INestFetchOptions } from '@/lib/nest-client';
import type { ICart } from '@/lib/types';

const GUEST_ID = /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const EMPTY_CART: ICart = {
  id: '',
  guestSessionId: '',
  items: [],
  totalItemsCount: 0,
  subTotalCents: 0,
};

/** Guest id from the cookie only, or null; used by reads so visitors without a cart cost no API call */
export async function existingGuestSessionId(): Promise<string | null> {
  const id = (await cookies()).get(GUEST_SESSION_COOKIE)?.value?.trim();
  return id && GUEST_ID.test(id) ? id : null;
}

/** The browser never reads this id, so it is httpOnly; 30 days matches the API's guest-session TTL window */
export function withGuestCookie(res: NextResponse, guestSessionId: string) {
  res.cookies.set(GUEST_SESSION_COOKIE, guestSessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

/** Runs a cart call against Nest with the visitor's guest id and returns the updated cart */
export async function cartCall(
  request: Request,
  path: string,
  options: Omit<INestFetchOptions, 'guestSessionId'> = {},
) {
  try {
    const guestSessionId = await resolveGuestSessionId(request);
    const result = await nestFetch<ICart>(path, {
      ...options,
      guestSessionId,
      request,
    });
    return withGuestCookie(
      NextResponse.json({ success: true, data: result.data }),
      guestSessionId,
    );
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export function clampQuantity(value: unknown): number {
  return Math.max(1, Math.min(50, Math.round(Number(value) || 1)));
}
