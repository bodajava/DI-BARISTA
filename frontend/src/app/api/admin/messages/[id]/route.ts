import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !['NEW', 'READ', 'ARCHIVED'].includes(body.status)) {
    return NextResponse.json({ success: false, error: 'Invalid status' }, { status: 400 });
  }
  try {
    await nestFetch(`/contact/messages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { status: body.status },
      nestToken: auth.nestToken,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  try {
    await nestFetch(`/contact/messages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      nestToken: auth.nestToken,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
