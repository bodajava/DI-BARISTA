import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { CouponDiscountType } from '../enums';

/**
 * 1. IsDateGreaterThanField (@IsDateGte(['startDate']))
 * Validates that the decorated date property is chronologically after the referenced field(s).
 */
@ValidatorConstraint({ name: 'IsDateGreaterThanField', async: false })
export class IsDateGreaterThanField implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    if (!value) return false;
    const targetDate = new Date(value as string | number | Date);
    if (Number.isNaN(targetDate.getTime())) return false;

    const rawConstraint = args.constraints?.[0];
    const fields: string[] = Array.isArray(rawConstraint)
      ? rawConstraint
      : typeof rawConstraint === 'string'
        ? [rawConstraint]
        : [];

    const obj = args.object as Record<string, unknown>;

    return fields.every((fieldName) => {
      const relatedValue = obj?.[fieldName];
      if (!relatedValue) return true;
      const relatedDate = new Date(relatedValue as string | number | Date);
      if (Number.isNaN(relatedDate.getTime())) return false;
      return targetDate.getTime() > relatedDate.getTime();
    });
  }

  defaultMessage(args: ValidationArguments): string {
    const rawConstraint = args.constraints?.[0];
    const fieldLabel = Array.isArray(rawConstraint)
      ? rawConstraint.join(', ')
      : String(rawConstraint || 'referenced date');
    return `${args.property} must be chronologically greater than ${fieldLabel}`;
  }
}

export function IsDateGte(
  fields: string[] | string,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [Array.isArray(fields) ? fields : [fields]],
      validator: IsDateGreaterThanField,
    });
  };
}

/**
 * 2. IsDateGreaterThanNow (@IsDateGthanNow())
 * Validates that the provided date is today or in the future (>= start of today).
 */
@ValidatorConstraint({ name: 'IsDateGreaterThanNow', async: false })
export class IsDateGreaterThanNow implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (!value) return false;
    const inputDate = new Date(value as string | number | Date);
    if (Number.isNaN(inputDate.getTime())) return false;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return inputDate.getTime() >= startOfToday.getTime();
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be today or a future date`;
  }
}

export function IsDateGthanNow(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsDateGreaterThanNow,
    });
  };
}

/**
 * 3. IsValidCouponDiscount (@IsValidDiscount())
 * - If coupon type is PERCENTAGE, ensures discount is between > 0 and <= 100.
 * - If coupon type is FIXED_AMOUNT, ensures discount is a positive number (> 0).
 */
@ValidatorConstraint({ name: 'IsValidCouponDiscount', async: false })
export class IsValidCouponDiscount implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const numericValue = Number(value);
    if (typeof value === 'boolean' || Number.isNaN(numericValue)) {
      return false;
    }

    const obj = args.object as Record<string, unknown>;
    const rawType = String(
      obj?.discountType ?? obj?.type ?? CouponDiscountType.PERCENTAGE,
    ).toUpperCase();

    if (rawType === CouponDiscountType.PERCENTAGE || rawType === 'PERCENTAGE') {
      return numericValue > 0 && numericValue <= 100;
    }

    if (
      rawType === CouponDiscountType.FIXED_AMOUNT ||
      rawType === CouponDiscountType.FIXED_AMOUNT_CENTS ||
      rawType === 'FIXED_AMOUNT'
    ) {
      return numericValue > 0;
    }

    return numericValue > 0;
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be between 1 and 100 for PERCENTAGE coupons, or a positive number for FIXED_AMOUNT coupons`;
  }
}

export function IsValidDiscount(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsValidCouponDiscount,
    });
  };
}

