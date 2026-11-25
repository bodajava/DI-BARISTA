import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { getServerEnv } from '@/lib/env';
import { getClientIp } from '@/lib/nest-client';

/**
 * One proxy for the whole dashboard: /api/admin/v1/<path> → <NEST_API_URL>/<path>, with the
 * staff token from the httpOnly cookie. The API enforces roles on every call.
 * After a catalog or settings write, the storefront's cached pages are expired at once.
 */
const ALLOWED_PREFIXES = [
  'orders',
  'products',
  'variants',
  'categories',
  'brands',
  'coupons',
  'contact',
  'newsletter',
  'admin',
  'notifications',
  'auth/me',
  'auth/admin/staff',
  'payments',
  'ai',
];

const STOREFRONT_TAGS: Array<[RegExp, string[]]> = [
  [/^(products|variants)\b/, ['products']],
  [/^(categories|brands)\b/, ['products', 'categories']],
  [/^admin\/settings\b/, ['settings']],
  [/^admin\/shipping-zones\b/, ['settings']],
  [/^orders\/[^/]+\/(status|refund)$/, ['products']],
];

type Ctx = { params: Promise<{ path: string[] }> };

async function handle(request: NextRequest, { params }: Ctx): Promise<Response> {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  const { path } = await params;
  const joined = path.map(encodeURIComponent).join('/');
  if (!ALLOWED_PREFIXES.some((p) => joined === p || joined.startsWith(`${p}/`) || joined.startsWith(`${p}?`))) {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

  const { nestApiUrl } = getServerEnv();
  const url = `${nestApiUrl}/${joined}${request.nextUrl.search}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.nestToken}`,
    Accept: request.headers.get('accept') || 'application/json',
  };
  const ip = getClientIp(request);
  if (ip) headers['x-forwarded-for'] = ip;

  let body: BodyInit | undefined;
  if (!['GET', 'HEAD'].includes(request.method)) {
    const type = request.headers.get('content-type') || '';
    if (type.includes('multipart/form-data')) {
      body = await request.formData();
    } else {
      const text = await request.text();
      if (text) {
        headers['Content-Type'] = 'application/json';
        body = text;
      }
    }
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, { method: request.method, headers, body, cache: 'no-store' });
  } catch {
    return NextResponse.json({ success: false, error: 'The store server is not reachable' }, { status: 502 });
  }

  if (upstream.ok && request.method !== 'GET') {
    const tags = new Set<string>();
    for (const [rx, list] of STOREFRONT_TAGS) if (rx.test(joined)) list.forEach((t) => tags.add(t));
    for (const tag of tags) revalidateTag(tag, { expire: 0 });
  }

  const contentType = upstream.headers.get('content-type') || 'application/json';
  const out = new Headers({ 'Content-Type': contentType, 'Cache-Control': 'no-store' });
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) out.set('Content-Disposition', disposition);

  if (!contentType.includes('application/json')) {
    return new Response(upstream.body, { status: upstream.status, headers: out });
  }
  const text = await upstream.text();
  if (!upstream.ok) {
    // Normalise Nest errors to { success: false, error: "readable message" }
    try {
      const parsed = JSON.parse(text) as { message?: string | string[]; error?: string };
      const message = Array.isArray(parsed.message) ? parsed.message.join('; ') : parsed.message || parsed.error;
      return NextResponse.json({ success: false, error: message || 'Request failed' }, { status: upstream.status });
    } catch {
      return NextResponse.json({ success: false, error: 'Request failed' }, { status: upstream.status });
    }
  }
  return new Response(text, { status: upstream.status, headers: out });
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const PUT = handle;
export const DELETE = handle;
