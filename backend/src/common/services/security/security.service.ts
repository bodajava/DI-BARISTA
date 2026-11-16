import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { decryptAES256, encryptAES256Gcm } from './encryption.security';
import { compareHash, generateHash } from './hash.security';
import { generateRandomCode, generateRandomString } from './random.security';

@Injectable()
export class SecurityService {
  private readonly saltRounds: number;
  private readonly rawEncryptionSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.saltRounds = Number(
      this.configService.get<number>('SALT_ROUND') ||
        this.configService.get<number>('BCRYPT_SALT_ROUNDS', 10),
    );

    this.rawEncryptionSecret =
      this.configService.getOrThrow<string>('ENCRYPTION_KEY');
  }

  /**
   * Hash plaintext password or secret using bcrypt
   */
  async hash(plainText: string, saltRound?: number): Promise<string> {
    return generateHash({
      plainText,
      saltRound: saltRound ?? this.saltRounds,
    });
  }

  async hashPassword(plainText: string): Promise<string> {
    return this.hash(plainText);
  }

  /**
   * Verify plaintext against bcrypt hash
   */
  async compare(plainText: string, hashValue: string): Promise<boolean> {
    return compareHash({ plainText, hashValue });
  }

  async comparePassword(plainText: string, hash: string): Promise<boolean> {
    return this.compare(plainText, hash);
  }

  /**
   * Encrypt sensitive data (e.g., phone numbers, PII) using AES-256
   */
  encrypt(plainText: string): string {
    return encryptAES256Gcm(plainText, this.rawEncryptionSecret);
  }

  /**
   * Decrypt AES-256 payload (supports both CBC `iv:cipher` and GCM `iv:authTag:cipher`)
   */
  decrypt(encryptedPayload: string): string {
    return decryptAES256(encryptedPayload, this.rawEncryptionSecret);
  }

  /**
   * Generate a cryptographically secure numeric OTP code
   */
  generateRandomCode(options: { length?: number } = { length: 4 }): string {
    return generateRandomCode(options);
  }

  generateNumericOtp(digits = 6): string {
    return generateRandomCode({ length: digits });
  }

  /**
   * Generate an alphanumeric random string via crypto.randomBytes
   */
  generateRandomString(options: { length?: number } = { length: 10 }): string {
    return generateRandomString(options);
  }

  /**
   * Generate deterministic SHA-256 hash
   */
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  /**
   * Hash a high-entropy token (e.g. a refresh JWT) for storage.
   * bcrypt is unsuitable here: it only reads the first 72 bytes, and every JWT of the
   * same user shares its first 72 bytes, so any old token would match the stored hash.
   */
  hashToken(token: string): string {
    return this.sha256(token);
  }

  compareTokenHash(token: string, storedHash: string): boolean {
    if (!token || !storedHash) return false;
    const a = Buffer.from(this.hashToken(token), 'utf8');
    const b = Buffer.from(storedHash, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /**
   * Compute HMAC-SHA512 signature and compare in constant time
   */
  verifyHmacSha512(
    concatenatedString: string,
    secret: string,
    expectedHmac: string,
  ): boolean {
    if (!concatenatedString || !secret || !expectedHmac) return false;
    const calculatedHmac = createHmac('sha512', secret)
      .update(concatenatedString)
      .digest('hex');

    const a = Buffer.from(calculatedHmac, 'utf8');
    const b = Buffer.from(expectedHmac, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
