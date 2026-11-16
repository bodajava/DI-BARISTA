import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard, RateLimitGuard, RolesGuard } from '../../guards';
import {
  FirebaseNotificationService,
  NotificationService,
} from '../../services/notification';
import { RateLimitService } from '../../services/rate-limit';
import { ConfigService } from '@nestjs/config';
import {
  BlobStorageService,
  LocalStorageService,
  S3Service,
  STORAGE_SERVICE_TOKEN,
} from '../../services/s3';
import { SecurityService } from '../../services/security';
import { TokenService } from '../../services/token';
import { CacheService } from '../../utilities/caching';
import { EmailService } from '../../utilities/emails';

const SHARED_PROVIDERS = [
  CacheService,
  EmailService,
  SecurityService,
  TokenService,
  RateLimitService,
  /**
   * File storage. Default: the server's own disk (STORAGE_DRIVER=local).
   * STORAGE_DRIVER=blob uses Vercel Blob (for Vercel, whose disk is temporary);
   * STORAGE_DRIVER=s3 (+ S3_* keys) an S3-compatible bucket.
   * Services keep injecting `S3Service`; this token decides what they actually get.
   */
  {
    provide: S3Service,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const driver = (config.get<string>('STORAGE_DRIVER') || 'local').toLowerCase();
      if (driver === 's3') return new S3Service(config);
      if (driver === 'blob') return new BlobStorageService(config);
      return new LocalStorageService(config);
    },
  },
  {
    provide: STORAGE_SERVICE_TOKEN,
    useExisting: S3Service,
  },
  NotificationService,
  FirebaseNotificationService,
  AuthGuard,
  RolesGuard,
  RateLimitGuard,
];

@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: SHARED_PROVIDERS,
  exports: [JwtModule, ...SHARED_PROVIDERS],
})
export class SharedModule {}

