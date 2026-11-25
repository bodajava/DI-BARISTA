import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export class EnvironmentVariablesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3001;

  @IsOptional()
  @IsString()
  APPLICATION_NAME: string = 'E-commerce';

  @IsOptional()
  @IsString()
  NODE_ENV: string = 'development';

  /** PostgreSQL connection string (pooled on serverless) */
  @IsString()
  DATABASE_URL: string;

  /** Direct (non-pooled) connection, used by migrations */
  @IsOptional()
  @IsString()
  DIRECT_DATABASE_URL?: string;

  @IsOptional()
  @IsString()
  REDIS_URI?: string;

  @IsString()
  @MinLength(32)
  ENCRYPTION_KEY: string;

  /** Previous ENCRYPTION_KEY, used only to decrypt data written before a key rotation */
  @IsOptional()
  @IsString()
  ENCRYPTION_KEY_LEGACY?: string;

  @IsString()
  @MinLength(32)
  USER_ACCESS_TOKE_SIGNATURE: string;

  @IsString()
  @MinLength(32)
  USER_REFRISH_TOKE_SIGNATURE: string;

  @IsString()
  @MinLength(32)
  SYSTEM_ACCESS_TOKE_SIGNATURE: string;

  @IsString()
  @MinLength(32)
  SYSTEM_REFRISH_TOKE_SIGNATURE: string;

  /** Comma-separated list of allowed browser origins, e.g. https://dibaresta.com */
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsString()
  ACCESS_EXPIRE_IN_DEV: string = '1d';

  @IsOptional()
  @IsString()
  REFRESH_EXPIRE_IN_DEV: string = '1d';

  @IsOptional()
  @IsString()
  ACCESS_EXPIRE_IN_PROD: string = '1d';

  @IsOptional()
  @IsString()
  REFRESH_EXPIRE_IN_PROD: string = '1d';

  @IsOptional()
  @IsString()
  CLIENT_GOOGLE_ID?: string;

  @IsOptional()
  @IsString()
  S3_REGION: string = 'us-east-1';

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  S3_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  S3_BUCKET_NAME: string = 'socailapp';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  AWS_EXPIRES_IN: number = 900;

  @IsOptional()
  @IsString()
  EMAIL_APP?: string;

  @IsOptional()
  @IsString()
  EMAIL_APP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  STRIPE_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  PAYMOB_PUBLIC_KEY?: string;

  @IsOptional()
  @IsString()
  PAYMOB_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  PAYMOB_API_KEY?: string;

  @IsOptional()
  @IsString()
  PAYMOB_IFRAME_ID?: string;

  @IsOptional()
  @IsString()
  PAYMOB_CURRENCY: string = 'EGP';

  @IsOptional()
  @IsString()
  PAYMOB_HMAC_SECRET?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PAYMOB_INTEGRATION_ID_CARD?: number;

  @IsOptional()
  @IsString()
  GEMINI_API_KEY?: string;

  @IsOptional()
  @IsString()
  GEMINI_MODEL: string = 'gemini-2.5-flash';

  @IsOptional()
  @IsString()
  SUPPORT_WHATSAPP_NUMBER: string = '201000000000';
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariablesDto {
  const validatedConfig = plainToInstance(EnvironmentVariablesDto, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const messages = errors
      .map((err) => Object.values(err.constraints || {}).join(', '))
      .join('; ');
    throw new Error(`Environment configuration validation failed: ${messages}`);
  }

  assertSecretsAreSafe(validatedConfig);
  return validatedConfig;
}

/**
 * Values that were ever published in .env.example or hard-coded as fallbacks.
 * Anyone who has seen the repository knows them, so they must never sign tokens.
 */
const KNOWN_PUBLIC_SECRETS = new Set([
  'D#@TR%#%_ACCESS_USER',
  'D#@TR%#%_USER_REFRISH_USER',
  'saraha_app_secret_key_32_chars_!!',
  'dibaresta_dev_jwt_secret_change_in_prod',
]);

function assertSecretsAreSafe(config: EnvironmentVariablesDto): void {
  const tokenSecrets = {
    USER_ACCESS_TOKE_SIGNATURE: config.USER_ACCESS_TOKE_SIGNATURE,
    USER_REFRISH_TOKE_SIGNATURE: config.USER_REFRISH_TOKE_SIGNATURE,
    SYSTEM_ACCESS_TOKE_SIGNATURE: config.SYSTEM_ACCESS_TOKE_SIGNATURE,
    SYSTEM_REFRISH_TOKE_SIGNATURE: config.SYSTEM_REFRISH_TOKE_SIGNATURE,
  };

  const problems: string[] = [];
  for (const [name, value] of Object.entries({
    ...tokenSecrets,
    ENCRYPTION_KEY: config.ENCRYPTION_KEY,
  })) {
    if (KNOWN_PUBLIC_SECRETS.has(value)) {
      problems.push(`${name} uses a publicly known default value`);
    }
  }

  const distinct = new Set(Object.values(tokenSecrets));
  if (distinct.size !== Object.keys(tokenSecrets).length) {
    problems.push(
      'USER_* and SYSTEM_* token signatures must all be different from each other',
    );
  }

  if (problems.length > 0) {
    throw new Error(
      `Insecure secret configuration: ${problems.join('; ')}. Generate new values with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`,
    );
  }
}
