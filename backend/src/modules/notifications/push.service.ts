import { Injectable, Logger } from '@nestjs/common';
import { DeviceAudience } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type Bilingual = { en: string; ar: string };

export interface PushMessage {
  /** order | payment | message | stock | status */
  kind: string;
  title: Bilingual;
  body: Bilingual;
  /** Dashboard/storefront path opened from the notification */
  link?: string;
  data?: Record<string, string>;
}

interface Messaging {
  sendEachForMulticast(message: { tokens: string[]; data: Record<string, string> }): Promise<{
    responses: Array<{ success: boolean; error?: { code?: string } }>;
  }>;
}

/**
 * Firebase Cloud Messaging web push. Data-only messages (the service worker draws them), one
 * language per device. Without FIREBASE_SERVICE_ACCOUNT the app keeps working, just silently.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private messaging: Messaging | null | undefined;

  constructor(private readonly prisma: PrismaService) {}

  get configured(): boolean {
    return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
  }

  private client(): Messaging | null {
    if (this.messaging !== undefined) return this.messaging;
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
      this.messaging = null;
      return null;
    }
    try {
      const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const app = require('firebase-admin/app') as typeof import('firebase-admin/app');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { getMessaging } = require('firebase-admin/messaging') as typeof import('firebase-admin/messaging');
      if (app.getApps().length === 0) app.initializeApp({ credential: app.cert(JSON.parse(json)) });
      this.messaging = getMessaging() as unknown as Messaging;
    } catch (error) {
      this.logger.warn(`Push disabled: ${(error as Error).message}`);
      this.messaging = null;
    }
    return this.messaging;
  }

  async register(token: string, audience: DeviceAudience, userId: string | null, locale: string): Promise<void> {
    await this.prisma.notificationDevice.upsert({
      where: { token },
      create: { token, audience, userId, locale: locale === 'ar' ? 'ar' : 'en' },
      update: { audience, userId, locale: locale === 'ar' ? 'ar' : 'en' },
    });
  }

  async unregister(token: string): Promise<void> {
    await this.prisma.notificationDevice.deleteMany({ where: { token } });
  }

  toStaff(message: PushMessage): Promise<void> {
    return this.send({ audience: DeviceAudience.STAFF }, message);
  }

  toCustomer(userId: string, message: PushMessage): Promise<void> {
    return this.send({ audience: DeviceAudience.CUSTOMER, userId }, message);
  }

  private async send(where: { audience: DeviceAudience; userId?: string }, message: PushMessage): Promise<void> {
    const messaging = this.client();
    if (!messaging) return;
    const devices = await this.prisma.notificationDevice.findMany({ where, select: { token: true, locale: true } });
    if (devices.length === 0) return;

    for (const locale of ['en', 'ar'] as const) {
      const tokens = devices.filter((d) => (d.locale === 'ar' ? 'ar' : 'en') === locale).map((d) => d.token);
      for (let i = 0; i < tokens.length; i += 500) {
        const batch = tokens.slice(i, i + 500);
        try {
          const result = await messaging.sendEachForMulticast({
            tokens: batch,
            data: {
              kind: message.kind,
              title: message.title[locale],
              body: message.body[locale],
              link: message.link ?? '',
              ...(message.data ?? {}),
            },
          });
          const dead = batch.filter((_, idx) => {
            const code = result.responses[idx]?.error?.code ?? '';
            return code.includes('registration-token-not-registered') || code.includes('invalid-registration-token');
          });
          if (dead.length) await this.prisma.notificationDevice.deleteMany({ where: { token: { in: dead } } });
        } catch (error) {
          this.logger.warn(`Push send failed: ${(error as Error).message}`);
        }
      }
    }
  }
}
