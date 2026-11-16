import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getServerEnv } from './env';
import { IAdminSessionPayload, UserRole } from './types';

export const ADMIN_SESSION_COOKIE = 'dibaresta_admin_session';
export const NEST_TOKEN_COOKIE = 'dibaresta_nest_token';
export const GUEST_SESSION_COOKIE = 'dibaresta_guest_session_id';

const ADMIN_ALLOWED_ROLES = new Set<string>(['ADMIN', 'SUPER_ADMIN']);

function getJwtSecretKey(): Uint8Array {
  const { jwtSecret } = getServerEnv();
  return new TextEncoder().encode(jwtSecret);
}

export async function signAdminSessionToken(
  payload: Omit<IAdminSessionPayload, 'iat' | 'exp'>,
): Promise<string> {
  return new SignJWT({
    sub: payload.sub,
    email: payload.email,
    fullName: payload.fullName,
    role: payload.role,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getJwtSecretKey());
}

export async function verifyAdminSessionToken(
  token: string,
): Promise<IAdminSessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), {
      algorithms: ['HS256'],
    });
    const role = String(payload.role || '').toUpperCase();
    if (!ADMIN_ALLOWED_ROLES.has(role) || !payload.sub || !payload.email) {
      return null;
    }
    return {
      sub: String(payload.sub),
      email: String(payload.email),
      fullName: String(payload.fullName || payload.email),
      role: role as UserRole,
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch {
    return null;
  }
}

export async function getAdminAuthContext(): Promise<{
  session: IAdminSessionPayload;
  nestToken: string;
} | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  const nestToken = cookieStore.get(NEST_TOKEN_COOKIE)?.value || '';
  if (!sessionToken || !nestToken) return null;

  const session = await verifyAdminSessionToken(sessionToken);
  if (!session) return null;

  return { session, nestToken };
}

export async function requireAdminApiContext(): Promise<
  | { ok: true; session: IAdminSessionPayload; nestToken: string }
  | { ok: false; response: NextResponse }
> {
  const ctx = await getAdminAuthContext();
  if (!ctx) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: 'Unauthorized: Valid ADMIN session required',
        },
        { status: 401 },
      ),
    };
  }
  return { ok: true, ...ctx };
}

const GUEST_SESSION_ID_PATTERN =
  /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API only accepts ids it could have issued (`guest_<uuid>`); anything else gets a fresh one */
export async function resolveGuestSessionId(
  request?: Request,
): Promise<string> {
  const headerId = request?.headers.get('x-guest-session-id')?.trim();
  if (headerId && GUEST_SESSION_ID_PATTERN.test(headerId)) return headerId;

  const cookieStore = await cookies();
  const cookieId = cookieStore.get(GUEST_SESSION_COOKIE)?.value?.trim();
  if (cookieId && GUEST_SESSION_ID_PATTERN.test(cookieId)) return cookieId;

  return `guest_${crypto.randomUUID()}`;
}
