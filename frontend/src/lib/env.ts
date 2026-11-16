/**
 * Signs the admin session cookie. There is deliberately no fallback: a default value would be
 * public (it lives in the repository) and would let anyone forge an admin session.
 */
function requireAdminSessionSecret(): string {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be set to a random value of at least 32 characters (see .env.example)',
    );
  }
  return secret;
}

export function getServerEnv() {
  return {
    nestApiUrl: (
      process.env.NEST_API_URL || 'http://localhost:3001/api/v1'
    ).replace(/\/+$/, ''),
    databaseUrl:
      process.env.DATABASE_URL ||
      process.env.DB_URL ||
      'mongodb://localhost:27017/dibaresta_caffe',
    jwtSecret: requireAdminSessionSecret(),
    paymobSecretKey: process.env.PAYMOB_SECRET_KEY || '',
    paymobPublicKey: process.env.PAYMOB_PUBLIC_KEY || '',
    paymobHmacSecret: process.env.PAYMOB_HMAC_SECRET || '',
    paymobCardIntegrationId:
      process.env.PAYMOB_INTEGRATION_ID_CARD ||
      process.env.PAYMOB_CARD_INTEGRATION_ID ||
      '6056178',
    paymobWalletIntegrationId: process.env.PAYMOB_INTEGRATION_ID_WALLET || '',
    aiApiKey: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '',
    aiModel:
      process.env.AI_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    appUrl: (
      process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    ).replace(/\/+$/, ''),
  };
}
