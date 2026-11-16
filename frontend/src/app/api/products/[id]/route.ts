import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { IProduct } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const result = await nestFetch<IProduct>(
      `/products/${encodeURIComponent(id)}`,
    );
    return NextResponse.json({
      success: true,
      data: result.data,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const contentType = request.headers.get('content-type') || '';
    let payload: unknown;

    if (contentType.includes('multipart/form-data')) {
      payload = await request.formData();
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      const cleaned: Record<string, unknown> = {};
      const allowedKeys = [
        'name',
        'nameAr',
        'name_en',
        'name_ar',
        'sku',
        'description',
        'description_en',
        'description_ar',
        'brandId',
        'categoryId',
        'roastLevel',
        'availableGrinds',
        'flavorNotes',
        'tastingNotes_en',
        'tastingNotes_ar',
        'originCountry',
        'originCountryAr',
        'elevation',
        'elevationAr',
        'processingMethod',
        'processingMethodAr',
        'weightGrams',
        'priceCents',
        'discountPercent',
        'stock',
        'isActive',
        'isFeatured',
        'status',
        'imageUrls',
      ];
      for (const key of allowedKeys) {
        if (body[key] !== undefined) {
          cleaned[key] = body[key];
        }
      }
      payload = cleaned;
    }

    const updated = await nestFetch<IProduct>(
      `/products/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: payload,
        nestToken: auth.nestToken,
      },
    );

    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/admin');

    return NextResponse.json({
      success: true,
      data: updated.data,
      message: 'Product updated successfully',
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const { id } = await context.params;
    const removed = await nestFetch<{ message: string }>(
      `/products/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        nestToken: auth.nestToken,
      },
    );

    revalidatePath('/');
    revalidatePath('/products');
    revalidatePath('/admin');

    return NextResponse.json({
      success: true,
      data: removed.data,
      message: removed.data?.message || 'Product deleted successfully',
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
