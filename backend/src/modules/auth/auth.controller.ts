import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentUser,
  GuestSession,
  Public,
  RateLimit,
  Roles,
} from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IJwtPayload } from '../../common/interfaces';
import { AuthService } from './auth.service';
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

@Controller('auth')
@UseGuards(AuthGuard, RolesGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Dedicated Admin & Barista Portal Login
   */
  @Public()
  @RateLimit({ limit: 5, windowSeconds: 15 * 60, bodyKey: 'email' })
  @Post('admin/login')
  @HttpCode(HttpStatus.OK)
  async adminLogin(@Body() dto: AdminLoginDto): Promise<AuthResponseEntity> {
    return this.authService.adminLogin(dto);
  }

  /**
   * Provision Admin / Barista Staff Account
   */
  @Post('admin/staff')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async createStaff(
    @Body() dto: CreateStaffDto,
    @CurrentUser('role') creatorRole: UserRole,
  ): Promise<UserProfileEntity> {
    return this.authService.createStaffMember(dto, creatorRole);
  }

  /**
   * Initialize or refresh a passwordless Guest Shopping Session
   */
  @Public()
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @Post('guest/session')
  @HttpCode(HttpStatus.OK)
  async initGuestSession(
    @GuestSession() guestSessionId?: string,
  ): Promise<GuestSessionEntity> {
    return this.authService.initGuestSession(guestSessionId);
  }

  /**
   * Capture Guest Customer contact & shipping info during Passwordless Checkout
   */
  @Public()
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @Post('guest/checkout')
  @HttpCode(HttpStatus.OK)
  async resolveGuestCheckoutCustomer(
    @Body() dto: GuestCheckoutCustomerDto,
    @GuestSession() guestSessionId?: string,
  ): Promise<UserProfileEntity> {
    return this.authService.resolveOrCreateGuestCustomer(dto, guestSessionId);
  }

  @Public()
  @RateLimit({ limit: 5, windowSeconds: 60 * 60 })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
  ): Promise<{ message: string; user: UserProfileEntity }> {
    return this.authService.register(dto);
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 15 * 60, bodyKey: 'email' })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto): Promise<AuthResponseEntity> {
    return this.authService.login(dto);
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 15 * 60, bodyKey: 'email' })
  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyEmailOtp(dto);
  }

  @Public()
  @RateLimit({ limit: 30, windowSeconds: 15 * 60 })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
  ): Promise<AuthResponseEntity> {
    return this.authService.refreshTokens(dto);
  }

  @Public()
  @RateLimit({ limit: 3, windowSeconds: 60 * 60, bodyKey: 'email' })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @RateLimit({ limit: 10, windowSeconds: 15 * 60, bodyKey: 'email' })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser() user: IJwtPayload,
  ): Promise<{ message: string }> {
    return this.authService.logout(user);
  }

  @Get('me')
  async getMe(@CurrentUser('sub') userId: string): Promise<UserProfileEntity> {
    return this.authService.getProfile(userId);
  }
}
