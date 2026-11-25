import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { STAFF_ROLES, TokenType, UserRole } from '../../common/enums';
import {
  AppEvents,
  PasswordResetRequestedEvent,
  UserRegisteredEvent,
} from '../../common/events';
import { IJwtPayload } from '../../common/interfaces';
import { NotificationService } from '../../common/services/notification';
import { SecurityService } from '../../common/services/security';
import { TokenService } from '../../common/services/token';
import { RateLimitService } from '../../common/services/rate-limit';
import { CacheService } from '../../common/utilities/caching';
import { Address, Prisma, User } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

type UserWithAddress = User & { addresses?: Address[] };
import {
  AdminLoginDto,
  CreateStaffDto,
  ForgotPasswordDto,
  GuestCheckoutCustomerDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyOtpDto,
} from './dto';
import {
  AuthResponseEntity,
  GuestSessionEntity,
  UserProfileEntity,
} from './entities/auth.entity';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private static readonly OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
  private static readonly GUEST_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
  private static readonly MAX_OTP_ATTEMPTS = 5;
  private static readonly KNOWN_DEFAULT_ADMIN_PASSWORD = 'Admin@123456';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly securityService: SecurityService,
    private readonly tokenService: TokenService,
    private readonly notificationService: NotificationService,
    private readonly cacheService: CacheService,
    private readonly rateLimitService: RateLimitService,
  ) {}

  /**
   * Automatic Super Admin Seeder on Module Initialization
   */
  async onModuleInit(): Promise<void> {
    await this.seedSuperAdmin();
  }

  async seedSuperAdmin(): Promise<void> {
    try {
      const existingSuperAdmin = await this.prisma.user.findFirst({
        where: { role: UserRole.SUPER_ADMIN, deletedAt: null },
      });

      if (existingSuperAdmin) {
        this.logger.log(
          `Super Admin account verified (${existingSuperAdmin.email})`,
        );
        await this.warnIfDefaultAdminPassword(existingSuperAdmin.email);
        return;
      }

      const plainPassword = this.configService.get<string>('SUPER_ADMIN_PASSWORD');
      if (
        !plainPassword ||
        plainPassword.length < 12 ||
        plainPassword === AuthService.KNOWN_DEFAULT_ADMIN_PASSWORD
      ) {
        this.logger.error(
          'SUPER_ADMIN_PASSWORD is missing, too short (<12 chars) or the public default. Super Admin was NOT seeded.',
        );
        return;
      }

      const email = this.configService
        .get<string>('SUPER_ADMIN_EMAIL', 'admin@dibarestacaffe.com')
        .toLowerCase()
        .trim();
      const fullName = this.configService.get<string>(
        'SUPER_ADMIN_NAME',
        'DIBARESTA Super Admin',
      );
      const phone = this.configService.get<string>(
        'SUPER_ADMIN_PHONE',
        '+201000000000',
      );

      const [hashedPassword, phoneEncrypted] = await Promise.all([
        this.securityService.hashPassword(plainPassword),
        Promise.resolve(this.securityService.encrypt(phone)),
      ]);

      await this.createUser({
        fullName,
        email,
        password: hashedPassword,
        phoneEncrypted,
        role: UserRole.SUPER_ADMIN,
        isGuest: false,
        isEmailVerified: true,
        isActive: true,
      });

      this.logger.log(`Seeded initial SUPER_ADMIN account: ${email}`);
    } catch (error) {
      this.logger.warn(
        `Super Admin seeder skipped or deferred: ${(error as Error).message}`,
      );
    }
  }

  private async warnIfDefaultAdminPassword(email: string): Promise<void> {
    const user = await this.findUserByEmail(email);
    if (
      user?.password &&
      (await this.securityService.comparePassword(
        AuthService.KNOWN_DEFAULT_ADMIN_PASSWORD,
        user.password,
      ))
    ) {
      this.logger.error(
        `SECURITY: Super Admin ${email} still uses the public default password. Change it immediately (POST /auth/forgot-password).`,
      );
    }
  }

  /**
   * Issue a token pair and store only a SHA-256 hash of the refresh token
   */
  private async issueSession(user: UserWithAddress): Promise<AuthResponseEntity> {
    const tokens = await this.tokenService.generateTokenPair({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    await this.updateUser(user.id, { refreshTokenHash: this.securityService.hashToken(tokens.refreshToken) });

    return new AuthResponseEntity({
      user: this.toUserProfileEntity(user),
      tokens,
    });
  }

  /**
   * Check an OTP with a hard cap on wrong guesses; the code is burned after MAX_OTP_ATTEMPTS
   */
  private async verifyOtpWithAttemptLimit(
    user: UserWithAddress,
    otpCode: string,
    purpose: 'verify' | 'reset',
  ): Promise<boolean> {
    if (
      !user.otpHash ||
      !user.otpExpiresAt ||
      user.otpExpiresAt.getTime() < Date.now()
    ) {
      return false;
    }

    const attemptsKey = `otp:${purpose}:${user.id}`;
    const attempt = await this.rateLimitService.hit(
      attemptsKey,
      AuthService.MAX_OTP_ATTEMPTS,
      10 * 60,
    );
    if (!attempt.allowed) {
      await this.updateUser(user.id, { otpHash: null, otpExpiresAt: null });
      throw new BadRequestException(
        'Too many wrong codes. Please request a new code.',
      );
    }

    const isValid = await this.securityService.comparePassword(
      otpCode,
      user.otpHash,
    );
    if (isValid) {
      await this.rateLimitService.reset(attemptsKey);
    }
    return isValid;
  }

  /**
   * 1. Dedicated Admin & Barista Dashboard Login
   * Strictly validates that the user holds a staff role (SUPER_ADMIN, ADMIN, BARISTA)
   * and signs tokens using SYSTEM_ACCESS_TOKE_SIGNATURE / SYSTEM_REFRISH_TOKE_SIGNATURE.
   */
  async adminLogin(dto: AdminLoginDto): Promise<AuthResponseEntity> {
    const user = await this.findUserByEmail(dto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid administrative credentials');
    }

    if (!STAFF_ROLES.includes(user.role)) {
      throw new ForbiddenException(
        'Access denied: Dedicated dashboard login is restricted to Admin and Barista personnel',
      );
    }

    if (!user.isActive) {
      throw new ForbiddenException('Staff account has been suspended');
    }

    const isPasswordValid = await this.securityService.comparePassword(
      dto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid administrative credentials');
    }

    return this.issueSession(user);
  }

  /**
   * Provision a new Admin or Barista staff member (Admin/SuperAdmin only)
   */
  async createStaffMember(
    dto: CreateStaffDto,
    creatorRole: UserRole,
  ): Promise<UserProfileEntity> {
    // Only a SUPER_ADMIN may create ADMIN/SUPER_ADMIN accounts; an ADMIN can add baristas only
    if (creatorRole !== UserRole.SUPER_ADMIN && dto.role !== UserRole.STAFF) {
      throw new ForbiddenException(
        'Only a Super Admin can create Admin or Super Admin accounts',
      );
    }

    const existing = await this.findUserByEmail(dto.email);
    if (existing) {
      throw new ConflictException('A user with this email already exists');
    }

    const hashedPassword = await this.securityService.hashPassword(
      dto.password,
    );
    const phoneEncrypted = dto.phone
      ? this.securityService.encrypt(dto.phone)
      : null;

    const staffUser = await this.createUser({
      fullName: dto.fullName,
      email: dto.email.toLowerCase().trim(),
      password: hashedPassword,
      phoneEncrypted,
      role: dto.role,
      isGuest: false,
      isEmailVerified: true,
      isActive: true,
    });

    return this.toUserProfileEntity(staffUser);
  }

  /**
   * 2. Passwordless Guest Shopping Session Initialization
   */
  async initGuestSession(
    existingSessionId?: string,
  ): Promise<GuestSessionEntity> {
    const guestSessionId =
      existingSessionId && existingSessionId.trim()
        ? existingSessionId.trim()
        : `guest_${randomUUID()}`;

    const createdAt = new Date().toISOString();
    await this.cacheService.set(
      `guest:session:${guestSessionId}`,
      { guestSessionId, createdAt },
      AuthService.GUEST_SESSION_TTL_SECONDS,
    );

    return new GuestSessionEntity({
      guestSessionId,
      expiresInSeconds: AuthService.GUEST_SESSION_TTL_SECONDS,
      createdAt,
    });
  }

  /**
   * 3. Passwordless Guest Checkout Customer Resolution
   */
  async resolveOrCreateGuestCustomer(
    dto: GuestCheckoutCustomerDto,
    headerGuestSessionId?: string,
  ): Promise<UserProfileEntity> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const effectiveSessionId =
      dto.guestSessionId || headerGuestSessionId || `guest_${randomUUID()}`;
    const phoneEncrypted = this.securityService.encrypt(dto.phone);

    const existingUser = await this.findUserByEmail(normalizedEmail);

    if (existingUser && (!existingUser.isGuest || STAFF_ROLES.includes(existingUser.role))) {
      // A guest checkout only proves knowledge of an email address, not ownership.
      // Registered and staff profiles are never modified from an unauthenticated request;
      // the order itself still stores the contact details typed at checkout.
      return this.toUserProfileEntity(existingUser);
    }

    if (existingUser) {
      const updated = await this.updateUser(existingUser.id, {
            fullName: dto.fullName,
            phoneEncrypted,
            guestSessionId: effectiveSessionId,
            ...(dto.favoriteRoast ? { favoriteRoast: dto.favoriteRoast } : {}),
      });
      return this.toUserProfileEntity(updated ?? existingUser);
    }

    const guestUser = await this.createUser({
      fullName: dto.fullName,
      email: normalizedEmail,
      password: null,
      phoneEncrypted,
      role: UserRole.CUSTOMER,
      isGuest: true,
      guestSessionId: effectiveSessionId,
      addresses: {
        create: {
          city: dto.shippingAddress.city,
          street: dto.shippingAddress.street,
          building: dto.shippingAddress.building ?? 'NA',
          floor: dto.shippingAddress.floor ?? 'NA',
          apartment: dto.shippingAddress.apartment ?? 'NA',
          notes: dto.shippingAddress.notes,
          isDefault: true,
        },
      },
      favoriteRoast: dto.favoriteRoast,
      isEmailVerified: false,
      isActive: true,
    });

    return this.toUserProfileEntity(guestUser);
  }

  /**
   * Registration only creates the account and emails an OTP. No tokens are issued until the
   * email is verified, otherwise anyone could register a guest's email and read their orders.
   */
  async register(
    dto: RegisterDto,
  ): Promise<{ message: string; user: UserProfileEntity }> {
    const existingUser = await this.findUserByEmail(dto.email);
    if (existingUser && !existingUser.isGuest) {
      throw new ConflictException('An account with this email already exists');
    }

    const [hashedPassword, otpCode] = await Promise.all([
      this.securityService.hashPassword(dto.password),
      Promise.resolve(this.securityService.generateNumericOtp(6)),
    ]);

    const otpHash = await this.securityService.hashPassword(otpCode);
    const phoneEncrypted = dto.phone
      ? this.securityService.encrypt(dto.phone)
      : null;

    let user: UserWithAddress;
    if (existingUser && existingUser.isGuest) {
      // Stays a guest (and cannot log in) until the OTP proves ownership of the inbox.
      // If someone else registers the same email first, the real owner can simply register again.
      const upgraded = await this.updateUser(existingUser.id, {
            fullName: dto.fullName,
            password: hashedPassword,
            phoneEncrypted: phoneEncrypted ?? existingUser.phoneEncrypted,
            favoriteRoast: dto.favoriteRoast ?? existingUser.favoriteRoast,
            isGuest: true,
            isEmailVerified: false,
            otpHash,
            otpExpiresAt: new Date(Date.now() + AuthService.OTP_TTL_MS),
      });
      user = upgraded ?? existingUser;
    } else {
      user = await this.createUser({
        fullName: dto.fullName,
        email: dto.email.toLowerCase().trim(),
        password: hashedPassword,
        phoneEncrypted,
        role: UserRole.CUSTOMER,
        isGuest: false,
        isEmailVerified: false,
        favoriteRoast: dto.favoriteRoast,
        otpHash,
        otpExpiresAt: new Date(Date.now() + AuthService.OTP_TTL_MS),
      });
    }

    this.notificationService.emit(
      AppEvents.USER_REGISTERED,
      new UserRegisteredEvent(user.id, user.email, user.fullName, otpCode),
    );

    return {
      message: 'Account created. Enter the verification code sent to your email.',
      user: this.toUserProfileEntity(user),
    };
  }

  async login(dto: LoginDto): Promise<AuthResponseEntity> {
    const user = await this.findUserByEmail(dto.email);
    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await this.securityService.comparePassword(
      dto.password,
      user.password,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new ForbiddenException('Account has been suspended');
    }

    if (
      !STAFF_ROLES.includes(user.role) &&
      (user.isGuest || !user.isEmailVerified)
    ) {
      throw new ForbiddenException(
        'Please verify your email with the code we sent before logging in',
      );
    }

    return this.issueSession(user);
  }

  async verifyEmailOtp(
    dto: VerifyOtpDto,
  ): Promise<{ message: string; user: UserProfileEntity; tokens?: AuthResponseEntity['tokens'] }> {
    const user = await this.findUserByEmail(dto.email);
    const genericError = new BadRequestException(
      'OTP code has expired or is invalid',
    );
    if (!user) {
      throw genericError;
    }

    if (user.isEmailVerified && !user.isGuest) {
      return {
        message: 'Email is already verified',
        user: this.toUserProfileEntity(user),
      };
    }

    const isOtpValid = await this.verifyOtpWithAttemptLimit(
      user,
      dto.otpCode,
      'verify',
    );
    if (!isOtpValid) {
      throw genericError;
    }

    const updatedUser = await this.updateUser(user.id, {
        isEmailVerified: true,
        isGuest: false,
        otpHash: null,
        otpExpiresAt: null,
      });

    const session = await this.issueSession(updatedUser ?? user);
    return {
      message: 'Email verified successfully',
      user: session.user,
      tokens: session.tokens,
    };
  }

  async refreshTokens(dto: RefreshTokenDto): Promise<AuthResponseEntity> {
    const payload = await this.tokenService.verifyToken(
      dto.refreshToken,
      TokenType.REFRESH,
    );

    const user = await this.findUserById(payload.sub);
    if (!user || !user.isActive || !user.refreshTokenHash) {
      throw new UnauthorizedException('Invalid refresh session');
    }

    const isRefreshValid = this.securityService.compareTokenHash(
      dto.refreshToken,
      user.refreshTokenHash,
    );
    if (!isRefreshValid) {
      throw new UnauthorizedException('Refresh token mismatch or rotated');
    }

    await this.tokenService.revokeToken(payload.jti, payload.exp);
    return this.issueSession(user);
  }

  async logout(currentUser: IJwtPayload): Promise<{ message: string }> {
    await Promise.all([
      this.tokenService.revokeToken(currentUser.jti, currentUser.exp),
      this.updateUser(currentUser.sub, { refreshTokenHash: null }),
    ]);

    return { message: 'Logged out successfully' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.findUserByEmail(dto.email);
    if (user && user.isActive && !user.isGuest) {
      const otpCode = this.securityService.generateNumericOtp(6);
      const otpHash = await this.securityService.hashPassword(otpCode);

      await this.updateUser(user.id, {
          otpHash,
          otpExpiresAt: new Date(Date.now() + AuthService.OTP_TTL_MS),
        });

      this.notificationService.emit(
        AppEvents.PASSWORD_RESET_REQUESTED,
        new PasswordResetRequestedEvent(
          user.id,
          user.email,
          user.fullName,
          otpCode,
        ),
      );
    }

    return {
      message:
        'If an account exists with this email, a password reset code has been sent',
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const user = await this.findUserByEmail(dto.email);
    if (
      !user ||
      !(await this.verifyOtpWithAttemptLimit(user, dto.otpCode, 'reset'))
    ) {
      throw new BadRequestException('Invalid or expired password reset code');
    }

    const hashedPassword = await this.securityService.hashPassword(
      dto.newPassword,
    );

    await this.updateUser(user.id, {
        password: hashedPassword,
        isGuest: false,
        // The code was delivered to the inbox, so ownership of the email is proven
        isEmailVerified: true,
        otpHash: null,
        otpExpiresAt: null,
        refreshTokenHash: null,
      });

    return { message: 'Password has been reset successfully' };
  }

  async getProfile(userId: string): Promise<UserProfileEntity> {
    const user = await this.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return this.toUserProfileEntity(user);
  }

  private findUserByEmail(email: string): Promise<UserWithAddress | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), deletedAt: null },
      include: { addresses: true },
    });
  }

  private findUserById(id: string): Promise<UserWithAddress | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: { addresses: true },
    });
  }

  private createUser(data: Prisma.UserCreateInput): Promise<UserWithAddress> {
    return this.prisma.user.create({ data, include: { addresses: true } });
  }

  private updateUser(id: string, data: Prisma.UserUpdateInput): Promise<UserWithAddress> {
    return this.prisma.user.update({ where: { id }, data, include: { addresses: true } });
  }

  private toUserProfileEntity(user: UserWithAddress): UserProfileEntity {
    const decryptedPhone = user.phoneEncrypted
      ? this.securityService.decrypt(user.phoneEncrypted)
      : null;

    return new UserProfileEntity({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: decryptedPhone,
      role: user.role,
      isGuest: Boolean(user.isGuest),
      guestSessionId: user.guestSessionId,
      shippingAddress: user.addresses?.find((a) => a.isDefault) ?? user.addresses?.[0] ?? null,
      isEmailVerified: user.isEmailVerified,
      favoriteRoast: user.favoriteRoast,
      createdAt: (user as unknown as { createdAt?: Date }).createdAt,
    });
  }
}
