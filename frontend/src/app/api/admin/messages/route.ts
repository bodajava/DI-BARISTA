import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import type { IContactMessage } from '@/lib/types';

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  const sp = request.nextUrl.searchParams;
  const query = new URLSearchParams({
    page: String(Math.max(1, Number(sp.get('page')) || 1)),
    limit: '50',
  });
  const status = sp.get('status');
  if (status && ['NEW', 'READ', 'ARCHIVED'].includes(status)) query.set('status', status);
  const search = (sp.get('search') || '').slice(0, 100);
  if (search) query.set('search', search);

  try {
    const res = await nestFetch<IContactMessage[]>(`/contact/messages?${query}`, {
      nestToken: auth.nestToken,
    });
    return NextResponse.json({ success: true, data: res.data || [], meta: res.meta });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
