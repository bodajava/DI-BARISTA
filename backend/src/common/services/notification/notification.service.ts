import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import {
  AppEvents,
  PasswordResetRequestedEvent,
  PaymentCompletedEvent,
  UserRegisteredEvent,
} from '../../events';
import { EmailService } from '../../utilities/emails';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Emit an asynchronous domain notification event
   */
  emit<T>(event: AppEvents, payload: T): boolean {
    return this.eventEmitter.emit(event, payload);
  }

  @OnEvent(AppEvents.USER_REGISTERED, { async: true })
  async handleUserRegistered(event: UserRegisteredEvent): Promise<void> {
    this.logger.log(
      `Dispatching registration OTP notification to ${event.email}`,
    );
    await this.emailService.sendVerificationOtp(event.email, {
      fullName: event.fullName,
      otpCode: event.otpCode,
      expiresInMinutes: 10,
    });
  }

  @OnEvent(AppEvents.PASSWORD_RESET_REQUESTED, { async: true })
  async handlePasswordResetRequested(
    event: PasswordResetRequestedEvent,
  ): Promise<void> {
    this.logger.log(
      `Dispatching password reset OTP notification to ${event.email}`,
    );
    await this.emailService.sendPasswordResetOtp(event.email, {
      fullName: event.fullName,
      otpCode: event.otpCode,
      expiresInMinutes: 10,
    });
  }

  @OnEvent(AppEvents.PAYMENT_COMPLETED, { async: true })
  handlePaymentCompleted(event: PaymentCompletedEvent): void {
    // The order service already emails the full order confirmation for paid orders;
    // sending a second "receipt" here gave customers two emails per payment.
    this.logger.log(`Payment completed for order #${event.orderReference}`);
  }
}
