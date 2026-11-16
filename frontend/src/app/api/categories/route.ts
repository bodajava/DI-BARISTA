import { NextResponse } from 'next/server';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import { ICategoryRef } from '@/lib/types';

export async function GET() {
  try {
    const res = await nestFetch<ICategoryRef[]>('/categories?limit=50');
    return NextResponse.json({
      success: true,
      data: res.data || [],
      meta: res.meta,
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
