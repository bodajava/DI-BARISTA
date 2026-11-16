import { NextRequest, NextResponse } from 'next/server';
import { isLocale } from '@/lib/i18n';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** POST { email, locale } from the storefront "Subscribe now" form */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    locale?: string;
  } | null;
  const email = (body?.email || '').trim().toLowerCase().slice(0, 254);
  if (!EMAIL.test(email)) {
    return NextResponse.json(
      { success: false, error: 'Please enter a valid email address' },
      { status: 400 },
    );
  }

  try {
    await nestFetch('/newsletter/subscribe', {
      method: 'POST',
      body: {
        email,
        locale: isLocale(body?.locale) ? body?.locale : 'en',
        source: 'home',
      },
      request,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
