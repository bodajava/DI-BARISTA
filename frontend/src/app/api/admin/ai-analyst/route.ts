import { NextRequest } from 'next/server';
import { requireAdminApiContext } from '@/lib/auth';
import { getServerEnv } from '@/lib/env';
import { nestFetch } from '@/lib/nest-client';
import {
  ICoupon,
  ICustomersDirectoryAnalytics,
  IOrder,
  IOverviewAnalytics,
  IProduct,
  IProductsPerformanceAnalytics,
  ISalesTrendAnalytics,
} from '@/lib/types';

function formatSseEvent(payload: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function buildGroundedFallback(params: {
  message: string;
  overview: IOverviewAnalytics;
  performance: IProductsPerformanceAnalytics;
  customers: ICustomersDirectoryAnalytics;
  salesTrend: ISalesTrendAnalytics;
  products: IProduct[];
  coupons: ICoupon[];
  orders: IOrder[];
}) {
  const { overview, performance, customers, products, coupons, orders } = params;
  const topWinners = (performance.winnerProducts || [])
    .slice(0, 3)
    .map(
      (p, i) =>
        `${i + 1}. **${p.name}** (${p.sku}) — ${p.totalQuantitySold} units sold · EGP ${(p.totalRevenueCents / 100).toFixed(2)}`,
    )
    .join('\n');

  const highDropOff = (performance.loserHighDropOffProducts || [])
    .slice(0, 3)
    .map(
      (p) =>
        `- **${p.name}** (${p.sku}): ${p.viewsCount} views vs ${p.soldCount} sold (drop-off ${p.dropOffRatio}x) · Stock ${p.stock}`,
    )
    .join('\n');

  const lowStock = products
    .filter((p) => Number(p.stock) <= 15)
    .slice(0, 5)
    .map((p) => `- **${p.name}** (${p.sku}): ${p.stock} units remaining`)
    .join('\n');

  const activeCoupons = coupons
    .filter((c) => c.isActive)
    .slice(0, 5)
    .map(
      (c) =>
        `- **${c.code}**: ${c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : `EGP ${(c.discountValue / 100).toFixed(2)}`} (${c.usedCount}/${c.usageLimit} redeemed)`,
    )
    .join('\n');

  const topSpenders = (customers.buyers || [])
    .slice(0, 3)
    .map(
      (b) =>
        `- **${b.customerName}** (${b.email}): ${b.totalOrdersCount} orders · ${b.totalSpendFormatted}`,
    )
    .join('\n');

  const latestOrders = orders
    .slice(0, 4)
    .map(
      (o) =>
        `- \`${o.orderNumber}\`: ${o.status} / ${o.paymentStatus} · EGP ${(o.totalCents / 100).toFixed(2)}`,
    )
    .join('\n');

  return `### Live DIBARESTA CAFFE Database Analysis

**Prompt:** ${params.message}

#### Revenue & Order KPIs
- **Total Revenue (Paid/Delivered):** ${overview.totalRevenueFormatted}
- **Orders:** ${overview.paidOrdersCount} paid of ${overview.totalOrdersCount} total orders
- **Average Order Value (AOV):** ${overview.averageOrderValueFormatted}
- **Unique Customers:** ${overview.uniqueCustomersCount} (Repeat buyers: ${customers.summary?.repeatBuyersCount ?? 0} | One-time: ${customers.summary?.oneTimeBuyersCount ?? 0})

#### Top Selling Coffees
${topWinners || '- No order items recorded yet.'}

#### Conversion & View Drop-Off Watchlist
${highDropOff || '- Insufficient product view telemetry yet.'}

#### Top Spenders
${topSpenders || '- No settled customer spenders yet.'}

#### Low Inventory Alerts (<= 15 units)
${lowStock || '- All SKUs currently above safety threshold.'}

#### Active Promo Coupons
${activeCoupons || '- No active promo codes.'}

#### Most Recent Orders
${latestOrders || '- No recent orders.'}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiContext();
  if (!auth.ok) return auth.response;

  const startedAt = Date.now();
  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    history?: Array<{ role: 'user' | 'assistant' | 'model'; content: string }>;
  };

  const message = (body.message || '').trim();
  if (!message) {
    return new Response(
      JSON.stringify({ success: false, error: 'Prompt message is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) =>
        controller.enqueue(formatSseEvent(payload));

      try {
        send({
          type: 'tool',
          tool: {
            id: 'tool_overview',
            name: 'query_analytics_and_orders',
            status: 'running',
            summary: 'Querying live MongoDB orders, revenue, products & customers...',
          },
        });

        const [
          overviewRes,
          performanceRes,
          customersRes,
          trendRes,
          productsRes,
          couponsRes,
          ordersRes,
        ] = await Promise.all([
          nestFetch<IOverviewAnalytics>('/admin/analytics/overview', {
            nestToken: auth.nestToken,
          }),
          nestFetch<IProductsPerformanceAnalytics>(
            '/admin/analytics/products-performance',
            { nestToken: auth.nestToken },
          ),
          nestFetch<ICustomersDirectoryAnalytics>(
            '/admin/analytics/customers',
            { nestToken: auth.nestToken },
          ),
          nestFetch<ISalesTrendAnalytics>(
            '/admin/analytics/sales-trend?interval=day',
            { nestToken: auth.nestToken },
          ),
          nestFetch<IProduct[]>('/products/admin/all?limit=100', {
            nestToken: auth.nestToken,
          }),
          nestFetch<ICoupon[]>('/coupons?limit=50', {
            nestToken: auth.nestToken,
          }),
          nestFetch<IOrder[]>('/orders?limit=25&sort=-createdAt', {
            nestToken: auth.nestToken,
          }),
        ]);

        const overview = overviewRes.data;
        const performance = performanceRes.data;
        const customers = customersRes.data;
        const salesTrend = trendRes.data;
        const products = productsRes.data || [];
        const coupons = couponsRes.data || [];
        const orders = ordersRes.data || [];

        send({
          type: 'tool',
          tool: {
            id: 'tool_overview',
            name: 'query_analytics_and_orders',
            status: 'done',
            summary: `Loaded ${overview.totalOrdersCount} orders, ${products.length} products, ${customers.summary?.totalDistinctBuyers ?? 0} customers, ${coupons.length} coupons.`,
          },
        });

        const contextSnapshot = {
          generatedAt: new Date().toISOString(),
          overview,
          productsPerformance: performance,
          customersSummary: customers.summary,
          topSpenders: (customers.buyers || []).slice(0, 10),
          recentSalesTrend: (salesTrend.series || []).slice(-14),
          inventoryCatalog: products.map((p) => ({
            name: p.name,
            sku: p.sku,
            roastLevel: p.roastLevel,
            priceEgp: Number((p.finalPriceCents / 100).toFixed(2)),
            stock: p.stock,
            soldCount: p.soldCount,
            viewsCount: p.viewsCount,
            isActive: p.isActive,
          })),
          coupons: coupons.map((c) => ({
            code: c.code,
            discountType: c.discountType,
            discountValue: c.discountValue,
            usedCount: c.usedCount,
            usageLimit: c.usageLimit,
            isActive: c.isActive,
            endDate: c.endDate,
          })),
          recentOrders: orders.slice(0, 15).map((o) => ({
            orderNumber: o.orderNumber,
            customerName: o.customerName,
            status: o.status,
            paymentStatus: o.paymentStatus,
            paymentMethod: o.paymentMethod,
            totalEgp: Number((o.totalCents / 100).toFixed(2)),
            couponCode: o.couponCode,
            createdAt: o.createdAt,
          })),
        };

        const { aiApiKey, aiModel } = getServerEnv();
        const isConfiguredKey =
          Boolean(aiApiKey) &&
          !aiApiKey.includes('your_gemini_api_key') &&
          !aiApiKey.includes('replace_me');

        let streamedFromModel = false;
        let modelUsed = `${aiModel} (Live DB Context)`;
        let totalChars = 0;

        if (isConfiguredKey) {
          try {
            const geminiEndpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
              aiModel,
            )}:streamGenerateContent?alt=sse&key=${encodeURIComponent(aiApiKey)}`;

            const historyContents = (body.history || [])
              .slice(-8)
              .map((h) => ({
                role: h.role === 'user' ? 'user' : 'model',
                parts: [{ text: h.content }],
              }));

            const systemInstructionText = [
              'You are DIBARESTA CAFFE Signal AI Analyst — a rigorous, quantitative specialty-coffee retail and operations analyst.',
              'Answer strictly from the LIVE DATABASE SNAPSHOT provided below in EGP currency. Never fabricate SKUs, revenue numbers, or customer stats.',
              'Format responses cleanly with markdown headings, bold figures, and actionable recommendations.',
              '',
              'LIVE DATABASE SNAPSHOT (JSON):',
              JSON.stringify(contextSnapshot),
            ].join('\n');

            const upstream = await fetch(geminiEndpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                systemInstruction: {
                  parts: [{ text: systemInstructionText }],
                },
                contents: [
                  ...historyContents,
                  { role: 'user', parts: [{ text: message }] },
                ],
                generationConfig: {
                  temperature: 0.35,
                  maxOutputTokens: 1400,
                },
              }),
            });

            if (upstream.ok && upstream.body) {
              const reader = upstream.body.getReader();
              const decoder = new TextDecoder();
              let buffer = '';

              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() ?? '';

                for (const rawLine of lines) {
                  const line = rawLine.trim();
                  if (!line.startsWith('data:')) continue;
                  const jsonStr = line.slice(5).trim();
                  if (!jsonStr || jsonStr === '[DONE]') continue;
                  try {
                    const parsed = JSON.parse(jsonStr) as {
                      candidates?: Array<{
                        content?: { parts?: Array<{ text?: string }> };
                      }>;
                    };
                    const text =
                      parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (text) {
                      streamedFromModel = true;
                      totalChars += text.length;
                      send({ type: 'delta', text });
                    }
                  } catch {
                    // Ignore partial SSE JSON chunks
                  }
                }
              }
            }
          } catch {
            streamedFromModel = false;
          }
        }

        if (!streamedFromModel) {
          let fallbackText = '';
          try {
            const nestAi = await nestFetch<{
              reply?: string;
              model?: string;
            }>('/admin/ai/chat', {
              method: 'POST',
              body: {
                message,
                history: body.history || [],
              },
              nestToken: auth.nestToken,
            });
            fallbackText = nestAi.data?.reply || '';
            if (nestAi.data?.model) {
              modelUsed = nestAi.data.model;
            }
          } catch {
            fallbackText = '';
          }

          if (!fallbackText) {
            modelUsed = 'dibaresta-db-grounded-analyst';
            fallbackText = buildGroundedFallback({
              message,
              overview,
              performance,
              customers,
              salesTrend,
              products,
              coupons,
              orders,
            });
          }

          const chunks = fallbackText.match(/[\s\S]{1,36}/g) || [fallbackText];
          for (const chunk of chunks) {
            totalChars += chunk.length;
            send({ type: 'delta', text: chunk });
            await new Promise((r) => setTimeout(r, 12));
          }
        }

        send({
          type: 'done',
          model: modelUsed,
          latencyMs: Date.now() - startedAt,
          tokenCount: Math.max(1, Math.round(totalChars / 4)),
        });
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : 'AI Analyst stream failed';
        send({ type: 'error', error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
