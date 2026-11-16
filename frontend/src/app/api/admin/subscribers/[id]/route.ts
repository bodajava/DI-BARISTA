import { NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;

  try {
    await nestFetch(`/newsletter/subscribers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      nestToken: auth.nestToken,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
