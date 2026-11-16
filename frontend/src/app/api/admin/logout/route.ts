import { NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE,
  getAdminAuthContext,
  NEST_TOKEN_COOKIE,
} from '@/lib/auth';
import { nestFetch } from '@/lib/nest-client';

export async function POST() {
  const ctx = await getAdminAuthContext();
  if (ctx?.nestToken) {
    try {
      await nestFetch('/auth/logout', {
        method: 'POST',
        nestToken: ctx.nestToken,
      });
    } catch {
      // Clear local session cookies regardless of upstream logout status
    }
  }

  const response = NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });

  response.cookies.delete(ADMIN_SESSION_COOKIE);
  response.cookies.delete(NEST_TOKEN_COOKIE);

  return response;
}
