import { NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';

export async function GET() {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    success: true,
    data: {
      user: {
        id: auth.session.sub,
        email: auth.session.email,
        fullName: auth.session.fullName,
        role: auth.session.role,
      },
    },
  });
}
