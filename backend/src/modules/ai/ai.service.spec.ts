import { ConfigService } from '@nestjs/config';
import { GrindType, RoastLevel } from '../../common/enums';
import { ProductRepository } from '../../models/repositories';
import { AnalyticsService } from '../analytics/analytics.service';
import { AiService } from './ai.service';

describe('AiService', () => {
  let service: AiService;
  let productRepository: jest.Mocked<Partial<ProductRepository>>;
  let analyticsService: jest.Mocked<Partial<AnalyticsService>>;

  const mockProducts = [
    {
      name: 'Ethiopian Yirgacheffe Kochere',
      sku: 'DIB-ETH-YIRG-250',
      originCountry: 'Ethiopia',
      roastLevel: RoastLevel.LIGHT,
      flavorNotes: ['Jasmine', 'Bergamot', 'Peach'],
      availableGrinds: [GrindType.WHOLE_BEAN, GrindType.FILTER_V60],
      priceCents: 45000,
      finalPriceCents: 45000,
      weightGrams: 250,
      stock: 40,
      isActive: true,
    },
    {
      name: 'Italian Dark Roast Espresso Blend',
      sku: 'DIB-ITA-ESP-500',
      originCountry: 'Brazil & Colombia',
      roastLevel: RoastLevel.DARK,
      flavorNotes: ['Dark Chocolate', 'Roasted Hazelnut', 'Molasses'],
      availableGrinds: [GrindType.WHOLE_BEAN, GrindType.ESPRESSO],
      priceCents: 72000,
      finalPriceCents: 68400,
      weightGrams: 500,
      stock: 30,
      isActive: true,
    },
  ];

  beforeEach(() => {
    productRepository = {
      findAll: jest.fn().mockResolvedValue(mockProducts),
    };

    analyticsService = {
      getOverviewKpis: jest.fn().mockResolvedValue({
        totalRevenueCents: 450000,
        totalRevenueFormatted: '4500.00 EGP',
        paidOrdersCount: 8,
        totalOrdersCount: 10,
        averageOrderValueCents: 56250,
        averageOrderValueFormatted: '562.50 EGP',
        uniqueCustomersCount: 6,
        ordersByStatus: [],
      }),
      getProductsPerformance: jest.fn().mockResolvedValue({
        winnerProducts: [
          {
            name: 'Ethiopian Yirgacheffe Kochere',
            sku: 'DIB-ETH-YIRG-250',
            totalQuantitySold: 12,
            totalRevenueCents: 540000,
          },
        ],
        loserHighDropOffProducts: [
          {
            name: 'Colombian Supremo Huila',
            sku: 'DIB-COL-SUP-250',
            viewsCount: 95,
            soldCount: 1,
            dropOffRatio: 47.5,
            finalPriceCents: 42000,
          },
        ],
      }),
      getCustomersDirectory: jest.fn().mockResolvedValue({
        summary: {
          totalDistinctBuyers: 6,
          repeatBuyersCount: 2,
          oneTimeBuyersCount: 4,
        },
        promoTargetingLists: {
          allBuyerEmails: ['a@test.com', 'b@test.com'],
          repeatBuyerEmails: ['a@test.com'],
          oneTimeBuyerEmails: ['b@test.com'],
        },
        buyers: [],
      }),
    };

    const configService = {
      get: jest.fn((key: string, defaultVal?: unknown) => {
        const map: Record<string, unknown> = {
          GEMINI_API_KEY: 'your_gemini_api_key_here',
          GEMINI_MODEL: 'gemini-2.5-flash',
          SUPPORT_WHATSAPP_NUMBER: '201012345678',
        };
        return map[key] ?? defaultVal;
      }),
    } as unknown as ConfigService;

    const couponRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      findByCode: jest.fn().mockResolvedValue(null),
    };

    service = new AiService(
      configService,
      productRepository as unknown as ProductRepository,
      analyticsService as unknown as AnalyticsService,
      couponRepository as unknown as any,
    );
  });

  it('should recommend V60 coffee grounded in ProductRepository catalog with handoff.needed = false', async () => {
    const res = await service.chatWithCustomer({
      message: 'What fruity coffee do you recommend for V60 pour over?',
    });

    expect(productRepository.findAll).toHaveBeenCalledWith({
      isActive: true,
      deletedAt: null,
    });
    expect(res.handoff.needed).toBe(false);
    expect(res.handoff.whatsappUrl).toBeUndefined();
    expect(res.reply).toContain('Ethiopian Yirgacheffe Kochere');
    expect(res.reply).toContain('1:15.5');
  });

  it('should trigger WhatsApp human handoff when customer requests order cancellation, refund, or human support', async () => {
    const res = await service.chatWithCustomer({
      message:
        'I want to cancel my order and get a refund, please let me speak to human support',
    });

    expect(res.handoff.needed).toBe(true);
    expect(res.handoff.whatsappUrl).toBeDefined();
    expect(res.handoff.whatsappUrl).toContain(
      'https://wa.me/201012345678?text=Hello%20Dibaresta%20Support',
    );
  });

  it('should aggregate live AnalyticsService KPIs and return structured Admin AI Business Advisor strategy', async () => {
    const res = await service.getAdminBusinessAdvisor({
      focusArea: 'PROMOTIONS',
    });

    expect(analyticsService.getOverviewKpis).toHaveBeenCalled();
    expect(analyticsService.getProductsPerformance).toHaveBeenCalled();
    expect(analyticsService.getCustomersDirectory).toHaveBeenCalled();

    expect(res.focusArea).toBe('PROMOTIONS');
    expect(res.model).toBe('gemini-2.5-flash');
    expect(res.metricsSnapshot.totalRevenueFormatted).toBe('4500.00 EGP');
    expect(res.metricsSnapshot.winnerProducts[0].name).toBe(
      'Ethiopian Yirgacheffe Kochere',
    );
    expect(res.metricsSnapshot.loserHighDropOffProducts[0].name).toBe(
      'Colombian Supremo Huila',
    );
    expect(res.analysis.pricingAdjustments.length).toBeGreaterThan(0);
    expect(res.analysis.promoCampaigns.length).toBeGreaterThan(0);
    expect(res.analysis.inventoryAndBundlingIdeas.length).toBeGreaterThan(0);
    expect(res.analysis.forecastAndGrowthOpportunities.length).toBeGreaterThan(
      0,
    );
  });
});

