import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { errorJsonResponse, nestFetch } from '@/lib/nest-client';
import {
  IBusinessInsights,
  ICustomersDirectoryAnalytics,
  IOverviewAnalytics,
  IProduct,
  IProductsPerformanceAnalytics,
  ISalesTrendAnalytics,
} from '@/lib/types';

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  try {
    const sp = request.nextUrl.searchParams;
    const rangeParams = new URLSearchParams();
    if (sp.get('from')) rangeParams.set('from', sp.get('from')!);
    if (sp.get('to')) rangeParams.set('to', sp.get('to')!);
    const rangeQs = rangeParams.toString();

    const interval = sp.get('interval') || 'day';
    const trendParams = new URLSearchParams(rangeParams);
    trendParams.set('interval', interval);

    const [overview, performance, customers, salesTrend, allProducts, insights] =
      await Promise.all([
        nestFetch<IOverviewAnalytics>(
          `/admin/analytics/overview${rangeQs ? `?${rangeQs}` : ''}`,
          { nestToken: auth.nestToken },
        ),
        nestFetch<IProductsPerformanceAnalytics>(
          '/admin/analytics/products-performance',
          { nestToken: auth.nestToken },
        ),
        nestFetch<ICustomersDirectoryAnalytics>(
          '/admin/analytics/customers',
          { nestToken: auth.nestToken },
        ),
        nestFetch<ISalesTrendAnalytics>(
          `/admin/analytics/sales-trend?${trendParams.toString()}`,
          { nestToken: auth.nestToken },
        ),
        nestFetch<IProduct[]>('/products/admin/all?limit=100', {
          nestToken: auth.nestToken,
        }),
        // Newer endpoint: never let it take the whole dashboard down
        nestFetch<IBusinessInsights>('/admin/analytics/insights', {
          nestToken: auth.nestToken,
        }).catch(() => ({ data: null })),
      ]);

    const products = allProducts.data || [];
    const totalViews = products.reduce(
      (sum, p) => sum + Number(p.viewsCount || 0),
      0,
    );
    const totalSold = products.reduce(
      (sum, p) => sum + Number(p.soldCount || 0),
      0,
    );

    const viewerLeaderboard = [...products]
      .sort((a, b) => Number(b.viewsCount || 0) - Number(a.viewsCount || 0))
      .slice(0, 10)
      .map((p) => {
        const views = Number(p.viewsCount || 0);
        const sold = Number(p.soldCount || 0);
        return {
          id: p.id,
          name: p.name,
          sku: p.sku,
          slug: p.slug,
          viewsCount: views,
          soldCount: sold,
          stock: p.stock,
          finalPriceCents: p.finalPriceCents,
          conversionRate: views > 0 ? Number(((sold / views) * 100).toFixed(1)) : 0,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        overview: overview.data,
        performance: performance.data,
        customers: customers.data,
        salesTrend: salesTrend.data,
        insights: insights.data,
        productEngagement: {
          totalViews,
          totalSold,
          catalogConversionRate:
            totalViews > 0
              ? Number(((totalSold / totalViews) * 100).toFixed(2))
              : 0,
          viewerLeaderboard,
        },
      },
    });
  } catch (error) {
    const err = errorJsonResponse(error);
    return NextResponse.json(err.body, { status: err.status });
  }
}
