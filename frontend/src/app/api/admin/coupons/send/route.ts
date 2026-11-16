import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import type { ICustomersDirectoryAnalytics, ISubscriber } from '@/lib/types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Gmail allows ~500 messages a day; keep one campaign well under that */
const MAX_RECIPIENTS = 400;

type Audience = 'subscribers' | 'buyers' | 'repeat' | 'oneTime' | 'custom';

/**
 * POST { code, audience, emails?, message?, locale?, restrict? }
 * Resolves the audience server-side (subscribers or buyer segments), then asks the API to
 * email the coupon to each recipient.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as {
    code?: string;
    audience?: Audience;
    emails?: string;
    message?: string;
    locale?: string;
    restrict?: boolean;
  };
  const code = String(body.code || '').trim().toUpperCase();
  if (!code) {
    return NextResponse.json({ success: false, error: 'Choose a coupon' }, { status: 400 });
  }

  try {
    let emails: string[] = [];
    if (body.audience === 'subscribers') {
      for (let page = 1; page <= 5; page++) {
        const res = await nestFetch<ISubscriber[]>(`/newsletter/subscribers?page=${page}&limit=100`, {
          nestToken: auth.nestToken,
        });
        emails.push(...(res.data || []).filter((s) => s.isActive).map((s) => s.email));
        if (!res.meta?.hasNextPage) break;
      }
    } else if (body.audience && body.audience !== 'custom') {
      const res = await nestFetch<ICustomersDirectoryAnalytics>('/admin/analytics/customers', {
        nestToken: auth.nestToken,
      });
      const lists = res.data.promoTargetingLists;
      emails =
        body.audience === 'repeat'
          ? lists.repeatBuyerEmails
          : body.audience === 'oneTime'
            ? lists.oneTimeBuyerEmails
            : lists.allBuyerEmails;
    } else {
      emails = String(body.emails || '').split(/[\s,;]+/);
    }

    const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e)))];
    if (unique.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid recipients' }, { status: 400 });
    }

    const res = await nestFetch<{ sentCount: number; totalTargeted: number }>('/coupons/send-to-buyers', {
      method: 'POST',
      nestToken: auth.nestToken,
      body: {
        code,
        emails: unique.slice(0, MAX_RECIPIENTS),
        customMessage: String(body.message || '').trim().slice(0, 500) || undefined,
        restrictToRecipients: Boolean(body.restrict),
        locale: body.locale === 'ar' ? 'ar' : 'en',
      },
    });
    return NextResponse.json({
      success: true,
      data: { ...res.data, capped: unique.length > MAX_RECIPIENTS },
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
