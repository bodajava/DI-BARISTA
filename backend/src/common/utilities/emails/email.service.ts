import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';
import Mail from 'nodemailer/lib/mailer';
import {
  EmailLocale,
  EmailTemplates,
  IEmailOrder,
  IEmailTemplateData,
  IRenderedEmail,
} from './email.templates';

export interface ISendMailOptions {
  to?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Mail.Attachment[];
  replyTo?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly defaultFrom: string;
  private readonly configured: boolean;
  private readonly adminInbox: string;

  constructor(private readonly configService: ConfigService) {
    const appName = this.configService.get<string>(
      'APPLICATION_NAME',
      'DIBARESTA CAFFE',
    );
    const emailUser =
      this.configService.get<string>('EMAIL_APP') ||
      this.configService.get<string>('SMTP_USER') ||
      process.env.EMAIL_APP ||
      '';
    const emailPass =
      this.configService.get<string>('EMAIL_APP_PASSWORD') ||
      this.configService.get<string>('SMTP_PASS') ||
      process.env.EMAIL_APP_PASSWORD ||
      '';

    this.defaultFrom = this.configService.get<string>(
      'MAIL_FROM',
      `"${appName} ☕️" <${emailUser || 'no-reply@dibarestacaffe.com'}>`,
    );

    this.configured = Boolean(emailUser && emailPass);
    this.adminInbox =
      this.configService.get<string>('ADMIN_NOTIFY_EMAIL') ||
      this.configService.get<string>('SUPER_ADMIN_EMAIL') ||
      emailUser;
    if (!this.configured) {
      this.logger.warn('EMAIL_APP / EMAIL_APP_PASSWORD are not set: emails will be skipped');
    }

    const customHost = this.configService.get<string>('SMTP_HOST');
    this.transporter = nodemailer.createTransport({
      // Gmail by default (EMAIL_APP + an App Password); set SMTP_HOST to use any other provider
      ...(customHost ? {} : { service: 'gmail' }),
      host: customHost || 'smtp.gmail.com',
      port: Number(this.configService.get<number>('SMTP_PORT', 587)),
      secure: this.configService.get<string>('SMTP_SECURE', 'false') === 'true',
      auth:
        emailUser && emailPass
          ? { user: emailUser, pass: emailPass }
          : undefined,
    });
  }

  /**
   * Validates recipients (to or bcc) and content (html, text, or attachments) and dispatches email
   */
  async sendEmail(options: Mail.Options): Promise<void> {
    const hasRecipient = Boolean(
      (options.to && String(options.to).trim().length > 0) ||
        (options.bcc && String(options.bcc).trim().length > 0),
    );
    if (!hasRecipient) {
      throw new BadRequestException(
        'Email recipient ("to" or "bcc") is required',
      );
    }

    const hasContent = Boolean(
      (options.html && String(options.html).trim().length > 0) ||
        (options.text && String(options.text).trim().length > 0) ||
        (options.attachments && options.attachments.length > 0),
    );
    if (!hasContent) {
      throw new BadRequestException(
        'Email content ("html", "text", or "attachments") is required',
      );
    }

    if (!this.configured) {
      this.logger.warn(`Email skipped (SMTP not configured): ${options.subject}`);
      return;
    }
    try {
      const info = await this.transporter.sendMail({
        from: options.from || this.defaultFrom,
        ...options,
      });
      this.logger.log(
        `Email dispatched [${info.messageId}] to ${String(options.to || options.bcc)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to dispatch email to ${String(options.to || options.bcc)}: ${(error as Error).message}`,
      );
    }
  }

  async sendMail(options: ISendMailOptions): Promise<boolean> {
    try {
      await this.sendEmail({
        from: this.defaultFrom,
        to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
        bcc: Array.isArray(options.bcc) ? options.bcc.join(', ') : options.bcc,
        subject: options.subject,
        html: options.html,
        text: options.text,
        attachments: options.attachments,
        replyTo: options.replyTo,
      });
      return this.configured;
    } catch (error) {
      this.logger.error(
        `Failed to dispatch email: ${(error as Error).message}`,
      );
      return false;
    }
  }

  async sendVerificationOtp(
    to: string,
    data: IEmailTemplateData,
  ): Promise<boolean> {
    const template = EmailTemplates.verificationOtp(data);
    return this.sendMail({ to, ...template });
  }

  async sendPasswordResetOtp(
    to: string,
    data: IEmailTemplateData,
  ): Promise<boolean> {
    const template = EmailTemplates.passwordResetOtp(data);
    return this.sendMail({ to, ...template });
  }

  async sendPaymentReceipt(
    to: string,
    data: IEmailTemplateData,
  ): Promise<boolean> {
    const template = EmailTemplates.paymentReceipt(data);
    return this.sendMail({ to, ...template });
  }

  async sendOrderRefundNotification(
    to: string,
    data: IEmailTemplateData,
  ): Promise<boolean> {
    const template = EmailTemplates.orderRefunded(data);
    return this.sendMail({ to, ...template });
  }

  private send(to: string, email: IRenderedEmail | null): Promise<boolean> {
    if (!email || !to) return Promise.resolve(false);
    return this.sendMail({ to, subject: email.subject, html: email.html, text: email.text });
  }

  /** Order placed (cash on delivery) or paid online; also alerts the shop inbox */
  async sendOrderConfirmation(order: IEmailOrder, paid: boolean): Promise<void> {
    await Promise.all([
      this.send(order.customerEmail, EmailTemplates.orderConfirmation(order, paid)),
      this.send(this.adminInbox, EmailTemplates.adminNewOrder(order, paid)),
    ]);
  }

  async sendOrderStatusUpdate(order: IEmailOrder, status: string): Promise<boolean> {
    return this.send(order.customerEmail, EmailTemplates.orderStatusUpdate(order, status));
  }

  async sendNewsletterWelcome(to: string, locale?: EmailLocale): Promise<boolean> {
    return this.send(to, EmailTemplates.newsletterWelcome(locale));
  }

  async notifyAdminNewMessage(msg: { email: string; message: string; locale?: string }): Promise<boolean> {
    return this.send(this.adminInbox, EmailTemplates.adminNewMessage(msg));
  }

  async sendGiftCard(
    to: string,
    data: { code: string; amountCents: number; message?: string | null; expiresAt?: Date | null; locale?: EmailLocale },
  ): Promise<boolean> {
    return this.send(to, EmailTemplates.giftCard(data));
  }

  /** Full order copy (with the printable PDF) for the shop's orders inbox */
  async sendOrdersInbox(to: string, order: IEmailOrder, paid: boolean, pdf?: Buffer): Promise<boolean> {
    if (!to) return false;
    const email = EmailTemplates.adminNewOrder(order, paid);
    return this.sendMail({
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      replyTo: order.customerEmail,
      attachments: pdf ? [{ filename: `${order.orderNumber}.pdf`, content: pdf, contentType: 'application/pdf' }] : undefined,
    });
  }
}
