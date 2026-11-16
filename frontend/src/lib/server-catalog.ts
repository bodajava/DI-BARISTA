import { nestFetch } from '@/lib/nest-client';
import type { ICategoryRef, IProduct } from '@/lib/types';

export async function fetchServerProducts(): Promise<IProduct[]> {
  try {
    const res = await nestFetch<IProduct[]>('/products?limit=100');
    return res.data || [];
  } catch {
    return [];
  }
}

export async function fetchServerCategories(): Promise<ICategoryRef[]> {
  try {
    const res = await nestFetch<ICategoryRef[]>('/categories?limit=50');
    return res.data || [];
  } catch {
    return [];
  }
}

export async function fetchServerProductBySlug(
  slug: string,
): Promise<IProduct | null> {
  try {
    const res = await nestFetch<IProduct>(
      `/products/${encodeURIComponent(slug)}?peek=1`,
    );
    return res.data || null;
  } catch {
    return null;
  }
}
