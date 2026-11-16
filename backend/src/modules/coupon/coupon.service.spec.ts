import { ForbiddenException } from '@nestjs/common';
import { CouponDiscountType } from '../../common/enums';
import { CouponService } from './coupon.service';

describe('CouponService', () => {
  let couponService: CouponService;
  const mockCouponRepo = {
    findByCode: jest.fn(),
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    incrementUsage: jest.fn(),
    incrementUsageByCode: jest.fn(),
  };
  const mockEmailService = {
    sendMail: jest.fn().mockResolvedValue(true),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    couponService = new CouponService(
      mockCouponRepo as any,
      mockEmailService as any,
    );
  });

  it('calculates percentage discount with cap accurately', async () => {
    mockCouponRepo.findByCode.mockResolvedValue({
      id: '65f000000000000000000010',
      code: 'COFFEE20',
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: 20,
      minOrderAmountCents: 20000,
      maxDiscountAmountCents: 10000,
      startDate: new Date(Date.now() - 60000),
      endDate: new Date(Date.now() + 3600000),
      usageLimit: 50,
      usedCount: 2,
      allowedEmails: [],
      isActive: true,
    });

    const res = await couponService.validateAndCalculateDiscount({
      code: 'coffee20',
      subTotalCents: 40000,
    });

    expect(res.discountCents).toBe(8000);
    expect(res.finalSubTotalCents).toBe(32000);
  });

  it('enforces allowedEmails restriction when populated', async () => {
    mockCouponRepo.findByCode.mockResolvedValue({
      id: '65f000000000000000000011',
      code: 'VIP50',
      discountType: CouponDiscountType.FIXED_AMOUNT,
      discountValue: 5000,
      minOrderAmountCents: 0,
      startDate: new Date(Date.now() - 60000),
      endDate: new Date(Date.now() + 3600000),
      usageLimit: 10,
      usedCount: 0,
      allowedEmails: ['vip@dibarestacaffe.com'],
      isActive: true,
    });

    await expect(
      couponService.validateAndCalculateDiscount({
        code: 'VIP50',
        subTotalCents: 30000,
        email: 'other@dibarestacaffe.com',
      }),
    ).rejects.toThrow(ForbiddenException);

    const allowedRes = await couponService.validateAndCalculateDiscount({
      code: 'VIP50',
      subTotalCents: 30000,
      email: 'vip@dibarestacaffe.com',
    });
    expect(allowedRes.discountCents).toBe(5000);
  });

  it('sends targeted promo emails to buyer list', async () => {
    mockCouponRepo.findByCode.mockResolvedValue({
      id: '65f000000000000000000010',
      code: 'COFFEE20',
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: 20,
      endDate: new Date('2027-01-01T00:00:00.000Z'),
      allowedEmails: [],
      isActive: true,
    });

    const result = await couponService.sendCouponToBuyers({
      code: 'COFFEE20',
      emails: ['buyer1@example.com', 'buyer2@example.com'],
      restrictToRecipients: true,
    });

    expect(result.sentCount).toBe(2);
    expect(mockEmailService.sendMail).toHaveBeenCalledTimes(2);
    expect(mockCouponRepo.findByIdAndUpdate).toHaveBeenCalled();
  });
});

