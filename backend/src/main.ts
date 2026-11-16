import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { mkdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { AppModule } from './app.module';
import {
  LoggingInterceptor,
  TransformResponseInterceptor,
} from './common/interceptors';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const configService = app.get(ConfigService);
  const port = Number(configService.get<number>('PORT', 3001));
  const appName = configService.get<string>(
    'APPLICATION_NAME',
    'DIBARESTA CAFFE',
  );
  const apiPrefix = configService.get<string>('API_PREFIX', 'api/v1');

  app.setGlobalPrefix(apiPrefix);

  // Uploaded images (local storage driver): served from /uploads, before any other middleware.
  // Files are only ever JPG/PNG/WEBP/AVIF (checked by content on upload); the headers below
  // stop the browser from treating anything here as a page or script.
  const uploadDir = resolve(
    configService.get<string>('UPLOAD_DIR') || join(process.cwd(), 'uploads'),
  );
  mkdirSync(uploadDir, { recursive: true });
  app.useStaticAssets(uploadDir, {
    prefix: '/uploads/',
    index: false,
    dotfiles: 'deny',
    maxAge: '365d',
    immutable: true,
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      // The storefront may live on another domain than the API
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  const isProduction =
    configService.get<string>('NODE_ENV', 'development') === 'production';

  // The API normally sits behind the Next.js server (and possibly a load balancer).
  // TRUST_PROXY = number of trusted proxy hops, so req.ip is the real client IP for rate limiting.
  app.set('trust proxy', Number(configService.get<string>('TRUST_PROXY', '1')));
  app.disable('x-powered-by');

  const allowedOrigins = (
    configService.get<string>('CORS_ORIGINS') ||
    (isProduction ? '' : 'http://localhost:3000')
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Server-to-server calls (Next.js route handlers, Paymob webhooks) send no Origin header
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    if (isProduction) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }
    next();
  });

  // Developer-only Paymob sandbox page; never exposed in production
  if (!isProduction) {
    app.getHttpAdapter().get('/test-store', (_req: Request, res: Response) => {
      const htmlPath = join(process.cwd(), 'test-checkout.html');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(readFileSync(htmlPath, 'utf8'));
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
    }),
  );

  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformResponseInterceptor(),
  );

  await app.listen(port);
  logger.log(
    `☕️ ${appName} Backend running on http://localhost:${port}/${apiPrefix}`,
  );
}

bootstrap();
