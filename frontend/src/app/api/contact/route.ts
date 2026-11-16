import { NextRequest, NextResponse } from 'next/server';
import { isLocale } from '@/lib/i18n';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** POST { email, message, locale } from the footer contact form */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    message?: string;
    locale?: string;
  } | null;
  const email = (body?.email || '').trim().toLowerCase().slice(0, 254);
  const message = (body?.message || '').trim().slice(0, 2000);
  if (!EMAIL.test(email) || message.length < 10) {
    return NextResponse.json(
      { success: false, error: 'A valid email and a message of at least 10 characters are required' },
      { status: 400 },
    );
  }

  try {
    await nestFetch('/contact', {
      method: 'POST',
      body: { email, message, locale: isLocale(body?.locale) ? body?.locale : 'en' },
      request,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
