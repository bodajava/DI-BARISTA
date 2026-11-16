import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface IFirebaseNotificationData {
  title: string;
  body: string;
  [key: string]: string;
}

export interface ISendSingleFirebaseNotification {
  token: string;
  data: IFirebaseNotificationData;
}

export interface ISendMultiFirebaseNotification {
  tokens: string[];
  data: IFirebaseNotificationData;
}

interface IFirebaseMessagingClient {
  send(message: {
    token: string;
    notification: { title: string; body: string };
    data?: Record<string, string>;
  }): Promise<string>;
}

@Injectable()
export class FirebaseNotificationService implements OnModuleInit {
  private readonly logger = new Logger(FirebaseNotificationService.name);
  private isInitialized = false;
  private messagingClient: IFirebaseMessagingClient | null = null;

  onModuleInit(): void {
    this.initializeFirebaseSafely();
  }

  private initializeFirebaseSafely(): void {
    const rawCredentialPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
    if (!rawCredentialPath) {
      this.logger.warn(
        'FIREBASE_SERVICE_ACCOUNT_PATH is not configured. Firebase push notifications will operate in graceful no-op mode.',
      );
      return;
    }

    const resolvedPath = path.isAbsolute(rawCredentialPath)
      ? rawCredentialPath
      : path.resolve(process.cwd(), rawCredentialPath);

    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(
        `Firebase service account file not found at "${resolvedPath}". Degrading gracefully without push notifications.`,
      );
      return;
    }

    try {
      const serviceAccount = JSON.parse(
        fs.readFileSync(resolvedPath, 'utf8'),
      ) as Record<string, unknown>;

      // Dynamically load firebase-admin if installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const firebaseApp = require('firebase-admin/app') as {
        getApps: () => unknown[];
        initializeApp: (options: unknown) => unknown;
        cert: (serviceAccountPathOrObject: Record<string, unknown>) => unknown;
      };
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const firebaseMessaging = require('firebase-admin/messaging') as {
        getMessaging: () => IFirebaseMessagingClient;
      };

      if (firebaseApp.getApps().length === 0) {
        firebaseApp.initializeApp({
          credential: firebaseApp.cert(serviceAccount),
        });
      }

      this.messagingClient = firebaseMessaging.getMessaging();
      this.isInitialized = true;
      this.logger.log('Firebase Admin SDK initialized successfully.');
    } catch (error) {
      this.logger.warn(
        `Firebase Admin initialization skipped or failed (${(error as Error).message}). Operating in graceful degraded mode.`,
      );
      this.isInitialized = false;
      this.messagingClient = null;
    }
  }

  /**
   * Send a push notification to a single device FCM token
   */
  async sendNotification({
    token,
    data,
  }: ISendSingleFirebaseNotification): Promise<string | null> {
    if (!token) return null;
    if (!this.isInitialized || !this.messagingClient) {
      this.logger.debug(
        `[No-Op FCM] Push notification "${data.title}" skipped (Firebase not initialized).`,
      );
      return null;
    }

    try {
      const { title, body, ...extraData } = data;
      return await this.messagingClient.send({
        token,
        notification: { title, body },
        data: extraData,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to send FCM notification to token "${token.slice(0, 12)}...": ${(error as Error).message}`,
      );
      return null;
    }
  }

  /**
   * Send push notifications to multiple device FCM tokens concurrently using Promise.allSettled
   */
  async sendNotifications({
    tokens,
    data,
  }: ISendMultiFirebaseNotification): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    results: PromiseSettledResult<string | null>[];
  }> {
    if (!tokens || tokens.length === 0) {
      return { total: 0, succeeded: 0, failed: 0, results: [] };
    }

    const uniqueTokens = Array.from(new Set(tokens.filter(Boolean)));
    const results = await Promise.allSettled(
      uniqueTokens.map((token) => this.sendNotification({ token, data })),
    );

    const succeeded = results.filter(
      (r) => r.status === 'fulfilled' && r.value !== null,
    ).length;
    const failed = results.length - succeeded;

    return {
      total: uniqueTokens.length,
      succeeded,
      failed,
      results,
    };
  }
}

