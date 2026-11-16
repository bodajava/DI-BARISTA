import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { IProduct } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const includeInactive = sp.get('includeInactive') === 'true';

    let nestToken: string | null = null;
    if (includeInactive) {
      const auth = await requireAdminApiContext();
      if (!auth.ok) return auth.response;
      nestToken = auth.nestToken;
    }

    const forwardParams = new URLSearchParams();
    for (const key of [
      'page',
      'limit',
      'sort',
      'search',
      'roastLevel',
      'grindType',
      'categoryId',
      'brandId',
      'minPrice',
      'maxPrice',
    ]) {
      const val = sp.get(key);
      if (val !== null && val !== '') {
        forwardParams.set(key, val);
      }
    }
    if (!forwardParams.has('limit')) {
      forwardParams.set('limit', '50');
    }

    const targetPath = includeInactive
      ? `/products/admin/all?${forwardParams.toString()}`
      : `/products?${forwardParams.toString()}`;

    const result = await nestFetch<IProduct[]>(targetPath, {
      nestToken,
    });

    return NextResponse.json({
      success: true,
      data: result.data || [],
      meta: result.meta,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const contentType = request.headers.get('content-type') || '';
    let payload: unknown;

    if (contentType.includes('multipart/form-data')) {
      payload = await request.formData();
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      payload = {
        name: body.name,
        ...(body.nameAr ? { nameAr: body.nameAr } : {}),
        sku: body.sku,
        ...(body.description !== undefined ? { description: body.description } : {}),
        brandId: body.brandId,
        categoryId: body.categoryId,
        ...(body.roastLevel ? { roastLevel: body.roastLevel } : {}),
        ...(body.availableGrinds ? { availableGrinds: body.availableGrinds } : {}),
        ...(body.flavorNotes ? { flavorNotes: body.flavorNotes } : {}),
        ...(body.originCountry ? { originCountry: body.originCountry } : {}),
        ...(body.weightGrams !== undefined
          ? { weightGrams: Number(body.weightGrams) }
          : {}),
        priceCents: Number(body.priceCents),
        ...(body.discountPercent !== undefined
          ? { discountPercent: Number(body.discountPercent) }
          : {}),
        stock: Number(body.stock),
        ...(body.isActive !== undefined ? { isActive: Boolean(body.isActive) } : {}),
        ...(body.isFeatured !== undefined
          ? { isFeatured: Boolean(body.isFeatured) }
          : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(Array.isArray(body.imageUrls) ? { imageUrls: body.imageUrls } : {}),
      };
    }

    const created = await nestFetch<IProduct>('/products', {
      method: 'POST',
      body: payload,
      nestToken: auth.nestToken,
    });

    revalidatePath('/');
    revalidatePath('/admin');

    return NextResponse.json(
      {
        success: true,
        data: created.data,
        message: 'Product created successfully',
      },
      { status: 201 },
    );
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
