import { NextRequest, NextResponse } from 'next/server';
import { isLocale } from '@/lib/i18n';
import { searchCatalog } from '@/lib/storefront-products';

/** GET /api/search?q=guatemala&locale=ar */
export async function GET(request: NextRequest) {
  const q = (request.nextUrl.searchParams.get('q') || '').trim().slice(0, 80);
  const localeParam = request.nextUrl.searchParams.get('locale');
  const locale = isLocale(localeParam) ? localeParam : 'en';
  if (!q) return NextResponse.json({ success: true, data: [] });

  const data = await searchCatalog(locale, q);
  return NextResponse.json(
    { success: true, data },
    { headers: { 'Cache-Control': 'public, max-age=60' } },
  );
}
