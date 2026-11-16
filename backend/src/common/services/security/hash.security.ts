import bcrypt from 'bcryptjs';

export interface IGenerateHashOptions {
  plainText: string;
  saltRound?: number;
}

export interface ICompareHashOptions {
  plainText: string;
  hashValue: string;
}

/**
 * Asynchronous bcrypt hash generation reading process.env.SALT_ROUND (default 10)
 */
export async function generateHash(
  plainTextOrOptions: string | IGenerateHashOptions,
  saltRoundOverride?: number,
): Promise<string> {
  const plainText =
    typeof plainTextOrOptions === 'string'
      ? plainTextOrOptions
      : plainTextOrOptions.plainText;

  const configuredSalt =
    typeof plainTextOrOptions === 'object' && plainTextOrOptions.saltRound
      ? plainTextOrOptions.saltRound
      : saltRoundOverride ??
        Number(
          process.env.SALT_ROUND || process.env.BCRYPT_SALT_ROUNDS || 10,
        );

  return bcrypt.hash(plainText, configuredSalt);
}

/**
 * Asynchronous bcrypt hash comparison
 */
export async function compareHash(
  plainTextOrOptions: string | ICompareHashOptions,
  hashValueArg?: string,
): Promise<boolean> {
  const plainText =
    typeof plainTextOrOptions === 'string'
      ? plainTextOrOptions
      : plainTextOrOptions.plainText;
  const hashValue =
    typeof plainTextOrOptions === 'string'
      ? hashValueArg || ''
      : plainTextOrOptions.hashValue;

  if (!plainText || !hashValue) return false;
  return bcrypt.compare(plainText, hashValue);
}

