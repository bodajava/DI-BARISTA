import { NextRequest, NextResponse } from 'next/server';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import type { ITrackedOrder } from '@/lib/types';

const ORDER_NUMBER = /^[A-Z0-9-]{6,40}$/;

/**
 * POST { orderNumber, contact } (a POST so the email/phone never lands in URLs or logs).
 * The API answers "not found" the same way for a wrong number or a wrong contact.
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    orderNumber?: string;
    contact?: string;
  } | null;
  const orderNumber = (body?.orderNumber || '').trim().toUpperCase();
  const contact = (body?.contact || '').trim().slice(0, 120);

  if (!ORDER_NUMBER.test(orderNumber) || contact.length < 5) {
    return NextResponse.json(
      { success: false, error: 'Order number and email or phone are required' },
      { status: 400 },
    );
  }

  try {
    const result = await nestFetch<ITrackedOrder>(
      `/orders/track/${encodeURIComponent(orderNumber)}?contact=${encodeURIComponent(contact)}`,
      { request, cache: 'no-store' },
    );
    return NextResponse.json(
      { success: true, data: result.data },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
