import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  verifyAdminSessionToken,
} from './lib/auth';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from './lib/i18n';

/** Saved choice first, then the browser's Accept-Language order (Arabic or English) */
function preferredLocale(request: NextRequest): Locale {
  const saved = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  const ranked = (request.headers.get('accept-language') || '')
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { lang: tag.slice(0, 2).toLowerCase(), q: q ? Number(q) : 1 };
    })
    .filter((entry) => entry.q > 0)
    .sort((a, b) => b.q - a.q);

  const match = ranked.find((entry) => isLocale(entry.lang))?.lang;
  return isLocale(match) ? match : DEFAULT_LOCALE;
}

/** Customer pages always live under /en or /ar; anything else is redirected there */
function localeRedirect(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const first = pathname.split('/')[1];
  if (isLocale(first)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${preferredLocale(request)}${pathname === '/' ? '' : pathname}`;
  const response = NextResponse.redirect(url);
  response.headers.set('Vary', 'Accept-Language, Cookie');
  return response;
}

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);
const PUBLIC_ADMIN_API_PATHS = new Set([
  '/api/admin/login',
  '/api/admin/logout',
]);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith('/admin') && !pathname.startsWith('/api/admin')) {
    return localeRedirect(request);
  }

  // CSRF: admin API calls that change data must come from this site's own pages
  if (
    pathname.startsWith('/api/admin') &&
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
  ) {
    // Compare against the Host the browser actually used (nextUrl.origin can report
    // "localhost" behind `next start` or a reverse proxy)
    const origin = request.headers.get('origin');
    const host =
      request.headers.get('x-forwarded-host') || request.headers.get('host');
    let originHost: string | null = null;
    try {
      originHost = origin ? new URL(origin).host : null;
    } catch {
      originHost = null;
    }
    if (!originHost || !host || originHost !== host) {
      return NextResponse.json(
        { success: false, error: 'Cross-site request blocked' },
        { status: 403 },
      );
    }
  }

  if (
    PUBLIC_ADMIN_PATHS.has(pathname) ||
    PUBLIC_ADMIN_API_PATHS.has(pathname)
  ) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  const session = sessionToken
    ? await verifyAdminSessionToken(sessionToken)
    : null;

  if (!session) {
    if (pathname.startsWith('/api/admin')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Valid ADMIN session required',
        },
        { status: 401 },
      );
    }

    const loginUrl = new URL('/admin/login', request.url);
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Pages (admin + storefront); skips other API routes, Next internals and files with an extension
    '/((?!api/|_next/|.*\\..*).*)',
    '/api/admin/:path*',
  ],
};
