import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  NEST_TOKEN_COOKIE,
  signAdminSessionToken,
} from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { UserRole } from '@/lib/types';

interface IAuthUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
}

interface INestLoginData {
  user: IAuthUser;
  tokens: {
    accessToken: string;
    refreshToken?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
    };

    const email = (body.email || '').trim().toLowerCase();
    const password = body.password || '';

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 },
      );
    }

    const res = await nestFetch<INestLoginData>('/auth/admin/login', {
      method: 'POST',
      request,
      body: { email, password },
    });

    const user = res.data?.user;
    const accessToken = res.data?.tokens?.accessToken;

    if (
      !user ||
      !accessToken ||
      !['STAFF', 'ADMIN', 'SUPER_ADMIN'].includes(String(user.role))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "This account can't open the dashboard",
        },
        { status: 403 },
      );
    }

    const sessionJwt = await signAdminSessionToken({
      sub: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    });

    const isProd = process.env.NODE_ENV === 'production';
    const response = NextResponse.json({
      success: true,
      data: { user },
    });

    response.cookies.set(ADMIN_SESSION_COOKIE, sessionJwt, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    response.cookies.set(NEST_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      path: '/',
      maxAge: 60 * 60 * 24,
    });

    return response;
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
