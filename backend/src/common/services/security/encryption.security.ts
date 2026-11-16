import { InternalServerErrorException } from '@nestjs/common';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  scryptSync,
} from 'crypto';

const CBC_ALGORITHM = 'aes-256-cbc';
const GCM_ALGORITHM = 'aes-256-gcm';

function resolveSecret(secretKey?: string): string {
  const rawSecret =
    secretKey || process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_SECRET_KEY;
  if (!rawSecret) {
    throw new InternalServerErrorException('ENCRYPTION_KEY is not configured');
  }
  return rawSecret;
}

export function deriveEncryptionKey(secretKey?: string): Buffer {
  return scryptSync(resolveSecret(secretKey), 'salt', 32);
}

function keysForSecret(rawSecret: string): Buffer[] {
  const candidates: Buffer[] = [
    scryptSync(rawSecret, 'salt', 32),
    createHash('sha256').update(rawSecret).digest(),
  ];

  if (/^[0-9a-fA-F]{64}$/.test(rawSecret)) {
    candidates.push(Buffer.from(rawSecret, 'hex'));
  } else if (Buffer.byteLength(rawSecret, 'utf8') === 32) {
    candidates.push(Buffer.from(rawSecret, 'utf8'));
  }

  return candidates;
}

/**
 * Keys tried during decryption: the current key first, then ENCRYPTION_KEY_LEGACY so data
 * written before a key rotation stays readable. New data is always encrypted with the current key.
 */
function deriveLegacyCandidateKeys(secretKey?: string): Buffer[] {
  const candidates = keysForSecret(resolveSecret(secretKey));
  const legacySecret = process.env.ENCRYPTION_KEY_LEGACY;
  if (legacySecret && legacySecret !== secretKey) {
    candidates.push(...keysForSecret(legacySecret));
  }
  return candidates;
}

/**
 * AES-256-CBC Encryption returning `ivHex:cipherTextHex`
 */
export function encryptAES256Cbc(
  plainText: string,
  secretKey?: string,
): string {
  if (!plainText) return plainText;
  try {
    const key = deriveEncryptionKey(secretKey);
    const iv = randomBytes(16);
    const cipher = createCipheriv(CBC_ALGORITHM, key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new InternalServerErrorException(
      `AES-256-CBC encryption failed: ${(error as Error).message}`,
    );
  }
}

/**
 * AES-256-GCM Encryption returning `ivHex:authTagHex:cipherTextHex`
 */
export function encryptAES256Gcm(
  plainText: string,
  secretKey?: string,
): string {
  if (!plainText) return plainText;
  try {
    const key = deriveEncryptionKey(secretKey);
    const iv = randomBytes(12);
    const cipher = createCipheriv(GCM_ALGORITHM, key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  } catch (error) {
    throw new InternalServerErrorException(
      `AES-256-GCM encryption failed: ${(error as Error).message}`,
    );
  }
}

/**
 * Universal AES-256 Decryption supporting both `ivHex:cipherTextHex` (AES-256-CBC)
 * and `ivHex:authTagHex:cipherTextHex` (AES-256-GCM) across scrypt and SHA-256 derived keys
 */
export function decryptAES256(
  encryptedPayload: string,
  secretKey?: string,
): string {
  if (!encryptedPayload || !encryptedPayload.includes(':')) {
    return encryptedPayload;
  }

  const candidateKeys = deriveLegacyCandidateKeys(secretKey);
  const parts = encryptedPayload.split(':');

  if (parts.length === 2) {
    const [ivHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    for (const key of candidateKeys) {
      try {
        const decipher = createDecipheriv(CBC_ALGORITHM, key, iv);
        let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch {
        // Try next candidate key
      }
    }
    throw new InternalServerErrorException('AES-256-CBC decryption failed');
  }

  if (parts.length === 3) {
    const [ivHex, authTagHex, cipherHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encryptedText = Buffer.from(cipherHex, 'hex');

    for (const key of candidateKeys) {
      try {
        const decipher = createDecipheriv(GCM_ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);
        const decrypted = Buffer.concat([
          decipher.update(encryptedText),
          decipher.final(),
        ]);
        return decrypted.toString('utf8');
      } catch {
        // Try next candidate key
      }
    }
    throw new InternalServerErrorException('AES-256-GCM decryption failed');
  }

  return encryptedPayload;
}
