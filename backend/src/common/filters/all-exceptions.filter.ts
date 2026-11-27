import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { runInBackground } from '../utilities/background';
import { CacheService } from '../utilities/caching';
import { EmailService } from '../utilities/emails';

/**
 * Error tracking: every error gets a reference id. Client errors (4xx) are answered as usual;
 * server errors (5xx) are logged with the stack and emailed to the shop inbox — at most once
 * per error kind every 30 minutes, so a burst never floods the inbox. The customer only sees
 * a short message with the reference, never internal details.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  constructor(
    private readonly email: EmailService,
    private readonly cache: CacheService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const ref = randomUUID().slice(0, 8);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: Record<string, unknown> = {
      statusCode: status,
      message: `Something went wrong on our side. Reference: ${ref}`,
      error: 'Internal Server Error',
      ref,
    };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      body = typeof response === 'string' ? { statusCode: status, message: response } : { ...(response as object) };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2002') {
      status = HttpStatus.CONFLICT;
      body = { statusCode: status, message: 'This already exists', error: 'Conflict' };
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && exception.code === 'P2025') {
      status = HttpStatus.NOT_FOUND;
      body = { statusCode: status, message: 'Not found', error: 'Not Found' };
    }

    if (status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      const where = `${req.method} ${req.route?.path ?? req.path}`;
      this.logger.error(`[${ref}] ${where} → ${err.name}: ${err.message}`, err.stack);
      runInBackground(this.alert(ref, where, err), 'error-alert');
    }

    if (!res.headersSent) res.status(status).json(body);
  }

  private async alert(ref: string, where: string, err: Error): Promise<void> {
    const signature = `${where}:${err.name}:${err.message.slice(0, 80)}`.replace(/\s+/g, ' ');
    const key = `alerts:error:${Buffer.from(signature).toString('base64url').slice(0, 80)}`;
    if (await this.cache.exists(key)) return;
    await this.cache.set(key, 1, 30 * 60);
    const to = process.env.ADMIN_NOTIFY_EMAIL || process.env.SUPER_ADMIN_EMAIL;
    if (!to) return;
    const text = [
      `Server error on the DI BARISTA API (${process.env.VERCEL_ENV || process.env.NODE_ENV || 'local'})`,
      `Reference: ${ref}`,
      `Where: ${where}`,
      `Error: ${err.name}: ${err.message}`,
      '',
      (err.stack || '').split('\n').slice(0, 12).join('\n'),
      '',
      'Same error again within 30 minutes is not re-sent. Full logs: Vercel → di-barista → Logs.',
    ].join('\n');
    await this.email.sendMail({
      to,
      subject: `⚠️ API error ${ref}: ${where}`,
      text,
      html: `<pre style="font:13px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')}</pre>`,
    });
  }
}
