import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { decryptAES256, encryptAES256Cbc } from './encryption.security';
import { SecurityService } from './security.service';

describe('SecurityService & Cryptographic Helpers', () => {
  let securityService: SecurityService;

  beforeEach(() => {
    const configService = new ConfigService({
      BCRYPT_SALT_ROUNDS: 4,
      ENCRYPTION_KEY: 'saraha_app_secret_key_32_chars_!!',
    });
    securityService = new SecurityService(configService);
  });

  it('hashes and verifies passwords accurately via hash/compare and hashPassword/comparePassword', async () => {
    const hash = await securityService.hash('CoffeeAdmin@123');
    expect(hash).toBeDefined();
    expect(hash).not.toEqual('CoffeeAdmin@123');

    const isValid = await securityService.compare('CoffeeAdmin@123', hash);
    const isInvalid = await securityService.comparePassword(
      'WrongPassword',
      hash,
    );

    expect(isValid).toBe(true);
    expect(isInvalid).toBe(false);
  });

  it('encrypts and decrypts sensitive phone numbers with AES-256-GCM and AES-256-CBC', () => {
    const plainPhone = '+201012345678';
    const encryptedGcm = securityService.encrypt(plainPhone);
    expect(encryptedGcm).toContain(':');
    expect(securityService.decrypt(encryptedGcm)).toBe(plainPhone);

    const encryptedCbc = encryptAES256Cbc(
      plainPhone,
      'saraha_app_secret_key_32_chars_!!',
    );
    expect(encryptedCbc.split(':')).toHaveLength(2);
    expect(
      decryptAES256(encryptedCbc, 'saraha_app_secret_key_32_chars_!!'),
    ).toBe(plainPhone);
  });

  it('generates cryptographically secure numeric codes and alphanumeric random strings', () => {
    const code4 = securityService.generateRandomCode({ length: 4 });
    expect(code4).toMatch(/^\d{4}$/);

    const randomStr = securityService.generateRandomString({ length: 16 });
    expect(randomStr).toHaveLength(16);
    expect(randomStr).toMatch(/^[A-Za-z0-9]{16}$/);
  });

  it('verifies HMAC-SHA512 signatures in constant time', () => {
    const payload = '420002026-11-08T12:00:00EGPfalsefalse999123456';
    const secret = 'test-hmac-secret-not-a-real-key-0001';
    const validHmac = createHmac('sha512', secret)
      .update(payload)
      .digest('hex');

    expect(securityService.verifyHmacSha512(payload, secret, validHmac)).toBe(
      true,
    );
    expect(
      securityService.verifyHmacSha512(payload, secret, 'invalid_hmac'),
    ).toBe(false);
  });
});
