import { ValidationArguments } from 'class-validator';
import { CouponDiscountType } from '../enums';
import {
  IsDateGreaterThanField,
  IsDateGreaterThanNow,
  IsValidCouponDiscount,
} from './custom-validators.decorator';

describe('Custom Class-Validator Decorators', () => {
  describe('IsDateGreaterThanField', () => {
    const validator = new IsDateGreaterThanField();

    it('returns true when endDate is chronologically after startDate', () => {
      const valid = validator.validate('2026-12-31T00:00:00.000Z', {
        constraints: [['startDate']],
        object: { startDate: '2026-12-01T00:00:00.000Z' },
        property: 'endDate',
        targetName: 'CreateCouponDto',
        value: '2026-12-31T00:00:00.000Z',
      } as ValidationArguments);

      expect(valid).toBe(true);
    });

    it('returns false when endDate is before or equal to startDate', () => {
      const invalid = validator.validate('2026-11-01T00:00:00.000Z', {
        constraints: [['startDate']],
        object: { startDate: '2026-12-01T00:00:00.000Z' },
        property: 'endDate',
        targetName: 'CreateCouponDto',
        value: '2026-11-01T00:00:00.000Z',
      } as ValidationArguments);

      expect(invalid).toBe(false);
    });
  });

  describe('IsDateGreaterThanNow', () => {
    const validator = new IsDateGreaterThanNow();

    it('returns true for today or future dates and false for past dates', () => {
      const future = new Date(Date.now() + 86_400_000).toISOString();
      const past = new Date('2020-01-01T00:00:00.000Z').toISOString();

      expect(validator.validate(future)).toBe(true);
      expect(validator.validate(past)).toBe(false);
    });
  });

  describe('IsValidCouponDiscount', () => {
    const validator = new IsValidCouponDiscount();

    it('validates PERCENTAGE discount between 1 and 100 and FIXED_AMOUNT > 0', () => {
      expect(
        validator.validate(25, {
          object: { discountType: CouponDiscountType.PERCENTAGE },
        } as ValidationArguments),
      ).toBe(true);

      expect(
        validator.validate(150, {
          object: { discountType: CouponDiscountType.PERCENTAGE },
        } as ValidationArguments),
      ).toBe(false);

      expect(
        validator.validate(5000, {
          object: { discountType: CouponDiscountType.FIXED_AMOUNT },
        } as ValidationArguments),
      ).toBe(true);
    });
  });
});

