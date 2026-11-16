import { randomBytes, randomInt } from 'crypto';

const ALPHANUMERIC_CHARS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a cryptographically secure numeric OTP code using crypto.randomInt
 */
export function generateRandomCode({
  length = 4,
}: { length?: number } = {}): string {
  const safeLength = Math.max(1, Math.min(length, 12));
  const min = Math.pow(10, safeLength - 1);
  const max = Math.pow(10, safeLength) - 1;
  return randomInt(min, max + 1).toString();
}

/**
 * Generates an alphanumeric random string via crypto.randomBytes
 */
export function generateRandomString({
  length = 10,
}: { length?: number } = {}): string {
  const safeLength = Math.max(1, length);
  const bytes = randomBytes(safeLength);
  let result = '';
  for (let i = 0; i < safeLength; i++) {
    result += ALPHANUMERIC_CHARS[bytes[i] % ALPHANUMERIC_CHARS.length];
  }
  return result;
}

