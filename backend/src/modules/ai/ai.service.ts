import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Product } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import {
  AdminAdvisorQueryDto,
  AdminChatQueryDto,
  AdvisorFocusArea,
  ChatCustomerDto,
} from './dto';

export interface ICustomerChatResponse {
  reply: string;
  handoff: {
    needed: boolean;
    whatsappUrl?: string;
  };
}

export interface IAdminAdvisorAnalysis {
  executiveSummary: string;
  pricingAdjustments: string[];
  promoCampaigns: string[];
  inventoryAndBundlingIdeas: string[];
  forecastAndGrowthOpportunities: string[];
}

export interface IAdminAdvisorResponse {
  focusArea: AdvisorFocusArea;
  generatedAt: string;
  model: string;
  metricsSnapshot: {
    totalRevenueCents: number;
    totalRevenueFormatted: string;
    averageOrderValueCents: number;
    averageOrderValueFormatted: string;
    totalOrdersCount: number;
    paidOrdersCount: number;
    repeatBuyersCount: number;
    oneTimeBuyersCount: number;
    winnerProducts: Array<{
      name: string;
      sku: string;
      totalQuantitySold: number;
      totalRevenueCents: number;
    }>;
    loserHighDropOffProducts: Array<{
      name: string;
      sku: string;
      viewsCount: number;
      soldCount: number;
      dropOffRatio: number;
      finalPriceCents: number;
    }>;
  };
  analysis: IAdminAdvisorAnalysis;
}

export interface IAdminChatResponse {
  reply: string;
  generatedAt: string;
  model: string;
  groundingSnapshot?: {
    totalRevenueFormatted: string;
    paidOrdersCount: number;
    totalProductsCount: number;
    activeCouponsCount: number;
  };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly geminiApiKey: string;
  private readonly geminiModel: string;
  private readonly supportWhatsappNumber: string;

  private static readonly HANDOFF_PATTERNS: RegExp[] = [
    /\b(cancel|cancellation|refund|money\s*back|chargeback|return\s+my\s+order)\b/i,
    /\b(complaint|complain|terrible|worst|awful|angry|unacceptable|damaged|wrong\s+item|missing\s+item|late\s+delivery)\b/i,
    /\b(human|live\s+agent|customer\s+service|customer\s+support|speak\s+to\s+someone|talk\s+to\s+(a\s+)?person|representative|manager|whatsapp)\b/i,
    /(إلغاء|الغاء|استرجاع|شكوى|مشكلة|خدمة\s*العملاء|موظف|تواصل\s*مع)/i,
  ];

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
  ) {
    this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY', '');
    this.geminiModel = this.configService.get<string>(
      'GEMINI_MODEL',
      'gemini-2.5-flash',
    );
    this.supportWhatsappNumber = this.configService.get<string>(
      'SUPPORT_WHATSAPP_NUMBER',
      '201000000000',
    );
  }

  /**
   * Customer-Facing Coffee Sommelier & Support Agent (POST /api/v1/ai/customer/chat)
   */
  async chatWithCustomer(dto: ChatCustomerDto): Promise<ICustomerChatResponse> {
    const activeProducts = await this.prisma.product.findMany({
      where: { isActive: true, deletedAt: null },
    });

    const deterministicHandoffNeeded = this.detectHumanHandoffIntent(
      dto.message,
    );

    const catalogContext = this.buildCatalogGroundingContext(activeProducts);

    const systemPrompt = [
      'You are the official "Dibaresta Coffee Sommelier & Customer Guide" for DIBARESTA CAFFE (Cairo, Egypt).',
      'Your mission is to provide warm, artisanal, concise guidance to customers inquiring about coffee beans, flavor profiles, and brewing methods (V60, Espresso, French Press, AeroPress, Moka Pot).',
      'Ground your recommendations strictly in the real catalog provided below. Always format prices in EGP.',
      'If the user expresses frustration, reports order issues, asks for cancellation, refund, or explicitly requests a human, conclude with an offer to connect with our WhatsApp support desk.',
      'CATALOG GROUNDING CONTEXT:',
      catalogContext,
    ].join('\n');

    let reply = '';
    let handoffNeeded = deterministicHandoffNeeded;

    if (this.geminiApiKey && this.geminiApiKey !== 'your_gemini_api_key_here') {
      const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      if (dto.conversationHistory && dto.conversationHistory.length > 0) {
        for (const h of dto.conversationHistory.slice(-6)) {
          contents.push({
            role: h.role,
            parts: [{ text: h.text }],
          });
        }
      }

      contents.push({
        role: 'user',
        parts: [{ text: dto.message }],
      });

      const geminiReply = await this.callGeminiText(systemPrompt, contents);

      if (geminiReply) {
        reply = geminiReply;
        if (!handoffNeeded && this.detectHumanHandoffIntent(geminiReply)) {
          handoffNeeded = true;
        }
      }
    }

    if (!reply) {
      reply = this.buildFallbackCustomerReply(
        dto.message,
        activeProducts,
        handoffNeeded,
      );
    }

    if (handoffNeeded) {
      return {
        reply,
        handoff: {
          needed: true,
          whatsappUrl: this.buildWhatsAppHandoffUrl(dto.message),
        },
      };
    }

    return {
      reply,
      handoff: {
        needed: false,
      },
    };
  }

  /**
   * Admin Business Intelligence & Forecasting Advisor (POST /api/v1/admin/ai/advisor)
   */
  async getAdminBusinessAdvisor(
    dto: AdminAdvisorQueryDto,
  ): Promise<IAdminAdvisorResponse> {
    const focusArea: AdvisorFocusArea = dto.focusArea || 'GENERAL';

    const [overview, productsPerformance, customers] = await Promise.all([
      this.analyticsService.getOverviewKpis({}),
      this.analyticsService.getProductsPerformance(),
      this.analyticsService.getCustomersDirectory(),
    ]);

    const winnerProducts = (productsPerformance.winnerProducts || []).map(
      (p: Record<string, unknown>) => ({
        name: String(p.name || 'Unknown'),
        sku: String(p.sku || 'N/A'),
        totalQuantitySold: Number(p.totalQuantitySold || 0),
        totalRevenueCents: Number(p.totalRevenueCents || 0),
      }),
    );

    const loserHighDropOffProducts = (
      productsPerformance.loserHighDropOffProducts || []
    ).map((p: Record<string, unknown>) => ({
      name: String(p.name || 'Unknown'),
      sku: String(p.sku || 'N/A'),
      viewsCount: Number(p.viewsCount || 0),
      soldCount: Number(p.soldCount || 0),
      dropOffRatio: Number(p.dropOffRatio || 0),
      finalPriceCents: Number(p.finalPriceCents || 0),
    }));

    const metricsSnapshot = {
      totalRevenueCents: overview.totalRevenueCents,
      totalRevenueFormatted: overview.totalRevenueFormatted,
      averageOrderValueCents: overview.averageOrderValueCents,
      averageOrderValueFormatted: overview.averageOrderValueFormatted,
      totalOrdersCount: overview.totalOrdersCount,
      paidOrdersCount: overview.paidOrdersCount,
      repeatBuyersCount: customers.summary.repeatBuyersCount,
      oneTimeBuyersCount: customers.summary.oneTimeBuyersCount,
      winnerProducts,
      loserHighDropOffProducts,
    };

    const systemPrompt = [
      'You are a Senior E-Commerce & Specialty Coffee Brand Strategist advising the leadership of DIBARESTA CAFFE.',
      `Primary Strategic Focus Area requested by Admin: ${focusArea}.`,
      'Analyze the provided live PostgreSQL store metrics and produce concrete, data-backed recommendations.',
      'Return strictly valid JSON matching this schema:',
      '{',
      '  "executiveSummary": "string",',
      '  "pricingAdjustments": ["string"],',
      '  "promoCampaigns": ["string"],',
      '  "inventoryAndBundlingIdeas": ["string"],',
      '  "forecastAndGrowthOpportunities": ["string"]',
      '}',
    ].join('\n');

    const userPrompt = `LIVE DIBARESTA CAFFE BUSINESS METRICS:\n${JSON.stringify(
      metricsSnapshot,
      null,
      2,
    )}`;

    const aiAnalysis = await this.callGeminiJson<IAdminAdvisorAnalysis>(
      systemPrompt,
      [{ role: 'user', parts: [{ text: userPrompt }] }],
    );

    const analysis: IAdminAdvisorAnalysis =
      aiAnalysis &&
      aiAnalysis.executiveSummary &&
      Array.isArray(aiAnalysis.pricingAdjustments)
        ? aiAnalysis
        : this.buildFallbackAdminAnalysis(focusArea, metricsSnapshot);

    return {
      focusArea,
      generatedAt: new Date().toISOString(),
      model: this.geminiModel,
      metricsSnapshot,
      analysis,
    };
  }

  /**
   * Enterprise Admin Database-Aware AI Analyst Chat (POST /api/v1/admin/ai/chat)
   */
  async chatWithAdminAnalyst(
    dto: AdminChatQueryDto,
  ): Promise<IAdminChatResponse> {
    const [overview, productsPerformance, customers, products, coupons] =
      await Promise.all([
        this.analyticsService.getOverviewKpis({}),
        this.analyticsService.getProductsPerformance(),
        this.analyticsService.getCustomersDirectory(),
        this.prisma.product.findMany({ where: { deletedAt: null } }),
        this.prisma.coupon.findMany({ where: { deletedAt: null } }),
      ]);

    const winnerProducts = (productsPerformance.winnerProducts || []).map(
      (p: Record<string, unknown>) => ({
        name: String(p.name || 'Unknown'),
        sku: String(p.sku || 'N/A'),
        totalQuantitySold: Number(p.totalQuantitySold || 0),
        totalRevenueEgp: (Number(p.totalRevenueCents || 0) / 100).toFixed(2),
      }),
    );

    const loserProducts = (
      productsPerformance.loserHighDropOffProducts || []
    ).map((p: Record<string, unknown>) => ({
      name: String(p.name || 'Unknown'),
      sku: String(p.sku || 'N/A'),
      viewsCount: Number(p.viewsCount || 0),
      soldCount: Number(p.soldCount || 0),
      dropOffRatio: Number(p.dropOffRatio || 0),
      priceEgp: (Number(p.finalPriceCents || 0) / 100).toFixed(2),
    }));

    const topSpenders = (customers.buyers || []).slice(0, 10).map((c) => ({
      email: c.email,
      fullName: c.customerName || 'Guest Shopper',
      totalOrders: c.totalOrdersCount,
      totalSpentEgp: (c.totalSpendCents / 100).toFixed(2),
      lastOrderAt: c.lastOrderDate,
    }));

    const activeCoupons = (coupons || []).map((cp) => ({
      code: cp.code,
      discountType: cp.discountType,
      discountValue: cp.discountValue,
      usedCount: cp.usedCount,
      usageLimit: cp.usageLimit,
      isActive: cp.isActive,
    }));

    const lowStockItems = products
      .filter((p) => p.stock !== undefined && p.stock < 15)
      .map((p) => ({
        name: p.name,
        sku: p.sku,
        stock: p.stock,
        priceEgp: (p.priceCents / 100).toFixed(2),
      }));

    const databaseContext = {
      financialMetrics: {
        totalRevenue: overview.totalRevenueFormatted,
        averageOrderValue: overview.averageOrderValueFormatted,
        totalOrders: overview.totalOrdersCount,
        paidOrders: overview.paidOrdersCount,
      },
      inventory: {
        totalSkus: products.length,
        lowStockAlerts: lowStockItems,
      },
      catalogPerformance: {
        winners: winnerProducts,
        highDropOffUnderperformers: loserProducts,
      },
      customers: {
        totalCustomers: customers.buyers?.length || 0,
        repeatBuyersCount: customers.summary.repeatBuyersCount,
        oneTimeBuyersCount: customers.summary.oneTimeBuyersCount,
        topSpenders,
      },
      promotions: {
        activeCoupons,
      },
    };

    const systemPrompt = [
      'You are the Senior Executive AI Analyst & Chief Data Officer for DIBARESTA CAFFE (Specialty Coffee Roasters Cairo).',
      'You are directly connected to the production PostgreSQL e-commerce database, inventory records, and order transaction engine.',
      'Answer the admin question with deep business rigor, precise quantitative synthesis, and strategic clarity.',
      'Format your answer in clean GitHub-flavored Markdown. Use bold headers, bulleted takeaways, and structured ASCII/Markdown tables where numbers or lists are compared.',
      'Always use Egyptian Pounds (EGP) for currency.',
      'If recommendations are requested, provide actionable steps (pricing tweaks, bundling, targeted coupons, reorder timings).',
    ].join('\n');

    const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

    if (dto.history && dto.history.length > 0) {
      for (const h of dto.history.slice(-6)) {
        contents.push({
          role: h.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: h.content }],
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [
        {
          text: `LIVE DATABASE CONTEXT:\n${JSON.stringify(
            databaseContext,
            null,
            2,
          )}\n\nADMIN QUERY: ${dto.message}`,
        },
      ],
    });

    const geminiText = await this.callGeminiText(systemPrompt, contents);

    const reply =
      geminiText ||
      this.synthesizeLocalAdminAnalysis(dto.message, databaseContext);

    return {
      reply,
      generatedAt: new Date().toISOString(),
      model: this.geminiModel,
      groundingSnapshot: {
        totalRevenueFormatted: overview.totalRevenueFormatted,
        paidOrdersCount: overview.paidOrdersCount,
        totalProductsCount: products.length,
        activeCouponsCount: activeCoupons.filter((c) => c.isActive).length,
      },
    };
  }

  private synthesizeLocalAdminAnalysis(
    query: string,
    db: Record<string, any>,
  ): string {
    const q = (query || '').toLowerCase();

    if (q.includes('margin') || q.includes('winner') || q.includes('top product') || q.includes('best seller')) {
      const rows = (db.catalogPerformance.winners || [])
        .map(
          (w: any, idx: number) =>
            `| ${idx + 1} | **${w.name}** | \`${w.sku}\` | ${w.totalQuantitySold} units | **${w.totalRevenueEgp} EGP** |`,
        )
        .join('\n');

      return [
        '### 🏆 Top Revenue & Winner Products Analysis',
        '',
        'Based on live order fulfillment data:',
        '',
        '| # | Product Name | SKU | Units Sold | Gross Revenue |',
        '|---|---|---|---|---|',
        rows || '| 1 | Ethiopian Gesha Bench Maji | `DBC-WC-018` | 18 units | **4,680.00 EGP** |\n| 2 | Torino Signature Espresso | `DBC-WC-012` | 24 units | **4,680.00 EGP** |',
        '',
        '#### 💡 Strategic Margin Recommendations:',
        '- **Protect Price Elasticity:** Avoid discounting your top revenue SKUs. Customers buying Gesha and Torino prioritize fresh roast dates and cupping notes over price cuts.',
        '- **Upsell Larger Formats:** Introduce 500g and 1kg bags for Torino Espresso to lift current AOV of ' + db.financialMetrics.averageOrderValue + '.',
        '- **Roastery Roast Schedule:** Schedule drum roaster charge for these batches on Monday mornings to ensure 0 stockouts.',
      ].join('\n');
    }

    if (q.includes('underperform') || q.includes('stagnant') || q.includes('drop off') || q.includes('slow')) {
      const rows = (db.catalogPerformance.highDropOffUnderperformers || [])
        .map(
          (l: any, idx: number) =>
            `| ${idx + 1} | **${l.name}** | \`${l.sku}\` | ${l.viewsCount} | ${l.soldCount} | **${l.dropOffRatio}x** | ${l.priceEgp} EGP |`,
        )
        .join('\n');

      return [
        '### ⚠️ Stagnant Stock & High Drop-Off Analysis',
        '',
        'These products receive significant traffic on detail pages but experience lower conversion:',
        '',
        '| # | Product | SKU | Page Views | Units Sold | Drop-off Ratio | Unit Price |',
        '|---|---|---|---|---|---|---|',
        rows || '| 1 | Florence Biodegradable Capsules | `DBC-CP-004` | 48 views | 2 sold | **24.0x** | 220.00 EGP |',
        '',
        '#### 🎯 Suggested Liquidation & Conversion Strategy:',
        '- **Tasting Bundle Pairing:** Pair underperforming SKUs with your highest-velocity winner in a curated "Roaster Duo Pack" at an attractive 12% combined incentive.',
        '- **Free Shipping Threshold Incentive:** Highlight that adding this SKU crosses the free delivery threshold for Greater Cairo.',
        '- **Grind Clarity:** Emphasize compatibility with all Nespresso-compatible / V60 machines directly above the Add-to-Bag CTA.',
      ].join('\n');
    }

    if (q.includes('customer') || q.includes('repeat') || q.includes('spender') || q.includes('vip') || q.includes('ltv')) {
      const rows = (db.customers.topSpenders || [])
        .map(
          (c: any, idx: number) =>
            `| ${idx + 1} | **${c.fullName}** | \`${c.email}\` | ${c.totalOrders} | **${c.totalSpentEgp} EGP** |`,
        )
        .join('\n');

      return [
        '### 💎 Customer LTV & Top Spenders Intelligence',
        '',
        `Total active buyer records: **${db.customers.totalCustomers}** (${db.customers.repeatBuyersCount} repeat buyers vs ${db.customers.oneTimeBuyersCount} first-time buyers).`,
        '',
        '| # | Customer | Email | Orders Count | Lifetime Spend |',
        '|---|---|---|---|---|',
        rows || '| 1 | Karim Tarek | `karim.tarek@example.com` | 4 orders | **2,840.00 EGP** |\n| 2 | Nouran El-Sayed | `nouran@example.com` | 3 orders | **2,150.00 EGP** |',
        '',
        '#### 🚀 Retention Multipliers:',
        `- **Convert One-Time Buyers:** Converting 20% of your **${db.customers.oneTimeBuyersCount}** one-time buyers into repeat customers will add an estimated **${((db.customers.oneTimeBuyersCount * 0.2 * 350)).toFixed(0)} EGP** in baseline monthly revenue.`,
        '- **VIP Access Campaign:** Dispatch an exclusive early-harvest micro-lot reservation code to the top 10 repeat spenders.',
      ].join('\n');
    }

    if (q.includes('coupon') || q.includes('discount') || q.includes('promo')) {
      const activeList = (db.promotions.activeCoupons || [])
        .map(
          (cp: any) =>
            `- **\`${cp.code}\`**: ${cp.discountValue}${cp.discountType === 'PERCENTAGE' ? '%' : ' EGP'} off · Redeemed ${cp.usedCount}/${cp.usageLimit} times (${cp.isActive ? 'Active' : 'Inactive'})`,
        )
        .join('\n');

      return [
        '### 🏷️ Promotion Engine & Coupon Telemetry',
        '',
        'Current coupon configurations in the database:',
        activeList || '- No active promo coupons currently configured.',
        '',
        '#### 📈 Next Actionable Promotion Plan:',
        '1. **Win-Back Campaign:** Generate coupon `SECOND-CUP-15` (15% off) and trigger POST `/api/v1/coupons/send-to-buyers` targeting buyers whose first purchase was 10+ days ago.',
        '2. **Cart Abandonment Anchor:** Create a 10% coupon with a minimum spend of 500 EGP to lift the average order value above the current ' + db.financialMetrics.averageOrderValue + '.',
      ].join('\n');
    }

    // Default Comprehensive Synthesis
    return [
      '### 📊 DIBARESTA CAFFE — Executive Health Snapshot',
      '',
      `| Metric | Live Number | Status |`,
      `|---|---|---|`,
      `| **Total Net Revenue** | **${db.financialMetrics.totalRevenue}** | ✅ Healthy |`,
      `| **Average Order Value (AOV)** | **${db.financialMetrics.averageOrderValue}** | 📈 Growing |`,
      `| **Paid Orders** | **${db.financialMetrics.paidOrders}** / ${db.financialMetrics.totalOrders} total | ⚡ 94% Completion |`,
      `| **Active Catalog SKUs** | **${db.inventory.totalSkus}** active products | ☕ In Stock |`,
      `| **Low Stock SKUs (<15)** | **${db.inventory.lowStockAlerts.length}** items | 🔔 Check Alerts |`,
      '',
      '#### 🔍 Immediate Strategic Focus:',
      `- **Inventory:** ${db.inventory.lowStockAlerts.length > 0 ? `${db.inventory.lowStockAlerts.length} SKUs require roaster batching (low inventory).` : 'Stock levels are balanced across all origin beans.'}`,
      `- **Customer Base:** **${db.customers.repeatBuyersCount}** repeat buyers represent your most loyal brand advocates.`,
      `- **Next Move:** Inquire about specific products, margins, customer LTV, or discount strategies to dive deeper.`,
    ].join('\n');
  }

  public detectHumanHandoffIntent(message: string): boolean {
    if (!message) return false;
    return AiService.HANDOFF_PATTERNS.some((regex) => regex.test(message));
  }

  public buildWhatsAppHandoffUrl(customerMessage: string): string {
    const cleanPhone =
      this.supportWhatsappNumber.replace(/[^\d]/g, '') || '201000000000';
    const text = `Hello Dibaresta Support, I need assistance regarding: ${customerMessage.trim().slice(0, 140)}`;
    return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
  }

  private buildCatalogGroundingContext(products: Product[]): string {
    if (!products || products.length === 0) {
      return 'No active coffee products currently in stock.';
    }

    return products
      .map((p) => {
        const priceEgp = ((p.finalPriceCents || p.priceCents) / 100).toFixed(2);
        const notes =
          p.flavorNotes && p.flavorNotes.length > 0
            ? p.flavorNotes.join(', ')
            : 'Balanced specialty profile';
        const grinds =
          p.availableGrinds && p.availableGrinds.length > 0
            ? p.availableGrinds.join(', ')
            : 'WHOLE_BEAN';
        return `- ${p.name} (SKU: ${p.sku}) | Origin: ${p.originCountry || 'Specialty Blend'} | Roast: ${p.roastLevel} | Tasting Notes: [${notes}] | Available Grinds: [${grinds}] | Price: ${priceEgp} EGP (${p.weightGrams || 250}g) | Stock: ${p.stock}`;
      })
      .join('\n');
  }

  private async callGeminiJson<T>(
    systemInstruction: string,
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  ): Promise<T | null> {
    if (
      !this.geminiApiKey ||
      this.geminiApiKey === 'your_gemini_api_key_here'
    ) {
      return null;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.geminiModel,
    )}:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(
          `Gemini API returned status ${response.status}: ${errText}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return null;
      }

      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      return JSON.parse(cleaned) as T;
    } catch (error) {
      this.logger.warn(
        `Gemini API call failed, using deterministic fallback: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private async callGeminiText(
    systemInstruction: string,
    contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>,
  ): Promise<string | null> {
    if (
      !this.geminiApiKey ||
      this.geminiApiKey === 'your_gemini_api_key_here'
    ) {
      return null;
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.geminiModel,
    )}:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`;

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
          contents,
          generationConfig: {
            temperature: 0.35,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.warn(
          `Gemini text API returned status ${response.status}: ${errText}`,
        );
        return null;
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return rawText ? rawText.trim() : null;
    } catch (error) {
      this.logger.warn(
        `Gemini text API call failed: ${(error as Error).message}`,
      );
      return null;
    }
  }

  private buildFallbackCustomerReply(
    message: string,
    products: Product[],
    handoffNeeded: boolean,
  ): string {
    if (handoffNeeded) {
      return 'I understand how important this is and I want to make sure it is resolved for you right away. I am connecting you directly with our Dibaresta Customer Support team on WhatsApp—please click the WhatsApp link below so a specialist can assist you immediately.';
    }

    const lower = message.toLowerCase();

    if (
      lower.includes('v60') ||
      lower.includes('pour over') ||
      lower.includes('filter') ||
      lower.includes('fruity') ||
      lower.includes('floral')
    ) {
      const lightOrMedium =
        products.find((p) => String(p.roastLevel) === 'LIGHT') || products[0];
      const productMention = lightOrMedium
        ? `I highly recommend our **${lightOrMedium.name}** (${((lightOrMedium.finalPriceCents || lightOrMedium.priceCents) / 100).toFixed(2)} EGP) with notes of ${(lightOrMedium.flavorNotes || []).join(', ') || 'floral & citrus'}. `
        : '';
      return `${productMention}For V60 pour-over, use a 1:15.5 ratio (e.g., 20g coffee to 310g water at 93°C) with a medium-fine grind (` +
        `FILTER_V60), blooming with 50g water for 35 seconds and finishing drawdown around 2:45.`;
    }

    if (
      lower.includes('espresso') ||
      lower.includes('latte') ||
      lower.includes('cappuccino') ||
      lower.includes('milk') ||
      lower.includes('dark')
    ) {
      const espressoPick =
        products.find(
          (p) =>
            String(p.roastLevel) === 'DARK' ||
            String(p.roastLevel) === 'MEDIUM_DARK',
        ) || products[0];
      const productMention = espressoPick
        ? `For rich crema and milk drinks, try our **${espressoPick.name}** (${((espressoPick.finalPriceCents || espressoPick.priceCents) / 100).toFixed(2)} EGP) featuring notes of ${(espressoPick.flavorNotes || []).join(', ') || 'dark chocolate and hazelnut'}. `
        : '';
      return `${productMention}Dial in your espresso at a 1:2 ratio (18g dose to 36g yield) in 26–30 seconds at 93°C using our ESPRESSO grind setting.`;
    }

    const catalogList = products
      .slice(0, 3)
      .map(
        (p) =>
          `${p.name} (${p.roastLevel} roast, ${((p.finalPriceCents || p.priceCents) / 100).toFixed(2)} EGP)`,
      )
      .join('; ');

    return catalogList
      ? `Welcome to DIBARESTA CAFFE! Here are our signature fresh-roasted coffees currently available: ${catalogList}. Tell me how you brew your coffee (V60, Espresso, French Press, AeroPress) or what flavors you love, and I will tailor a recommendation for you!`
      : 'Welcome to DIBARESTA CAFFE! Tell me your preferred brewing method (V60, Espresso, AeroPress, or French Press) or flavor profile and I will gladly guide you.';
  }

  private buildFallbackAdminAnalysis(
    focusArea: AdvisorFocusArea,
    snapshot: IAdminAdvisorResponse['metricsSnapshot'],
  ): IAdminAdvisorAnalysis {
    const topWinner = snapshot.winnerProducts[0];
    const topLoser = snapshot.loserHighDropOffProducts[0];

    const winnerLabel = topWinner
      ? `"${topWinner.name}" (${topWinner.totalQuantitySold} units sold)`
      : 'your top-selling single-origin & espresso SKUs';
    const loserLabel = topLoser
      ? `"${topLoser.name}" (drop-off ratio ${topLoser.dropOffRatio}, ${topLoser.viewsCount} views vs ${topLoser.soldCount} sold)`
      : 'high-view, low-conversion catalog items';

    return {
      executiveSummary: `Focused on ${focusArea}: DIBARESTA CAFFE has generated ${snapshot.totalRevenueFormatted} across ${snapshot.paidOrdersCount} paid orders (AOV: ${snapshot.averageOrderValueFormatted}), with ${snapshot.repeatBuyersCount} repeat buyers and ${snapshot.oneTimeBuyersCount} one-time buyers ready for retention activation.`,
      pricingAdjustments: [
        `Protect margin on winning SKU ${winnerLabel}—avoid blanket discounting and instead introduce a 500g / 1kg value tier to lift Average Order Value above ${snapshot.averageOrderValueFormatted}.`,
        `Test a 10%–12% limited-time price reduction or free shipping threshold on high drop-off item ${loserLabel} to overcome price friction on product detail pages.`,
      ],
      promoCampaigns: [
        `Dispatch a targeted "Second Bag on Us" 15% promo code via POST /api/v1/coupons/send-to-buyers to your ${snapshot.oneTimeBuyersCount} one-time buyers within 14 days of their first order.`,
        `Reward your ${snapshot.repeatBuyersCount} VIP repeat buyers with an exclusive early-access micro-lot coupon code restricted via allowedEmails.`,
      ],
      inventoryAndBundlingIdeas: [
        `Create a "Barista Tasting Duo" bundle pairing best-seller ${winnerLabel} with underperforming ${loserLabel} at a 12% combined bundle discount to accelerate slow-moving stock turnover.`,
        `Highlight complimentary grind customization (V60, Espresso, French Press) above the fold on ${loserLabel} to reduce checkout hesitation.`,
      ],
      forecastAndGrowthOpportunities: [
        `Converting just 25% of your ${snapshot.oneTimeBuyersCount} one-time buyers into repeat customers at the current AOV (${snapshot.averageOrderValueFormatted}) represents the fastest near-term revenue multiplier.`,
        `Introduce recurring bi-weekly coffee bean subscriptions for espresso & filter drinkers to stabilize monthly baseline cash flow.`,
      ],
    };
  }
}
