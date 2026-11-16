export enum AppEvents {
  USER_REGISTERED = 'user.registered',
  PASSWORD_RESET_REQUESTED = 'user.password_reset_requested',
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
}

export class UserRegisteredEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly fullName: string,
    public readonly otpCode: string,
  ) {}
}

export class PasswordResetRequestedEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly fullName: string,
    public readonly otpCode: string,
  ) {}
}

export class PaymentCompletedEvent {
  constructor(
    public readonly paymentId: string,
    public readonly orderReference: string,
    public readonly email: string,
    public readonly amountCents: number,
    public readonly currency: string,
  ) {}
}

