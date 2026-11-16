import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import { STAFF_ROLES, TokenType, UserRole } from '../../enums';
import { IJwtPayload, ITokenPair } from '../../interfaces';
import { CacheService } from '../../utilities/caching';

@Injectable()
export class TokenService {
  private readonly userAccessSecret: string;
  private readonly userRefreshSecret: string;
  private readonly systemAccessSecret: string;
  private readonly systemRefreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    const isProd =
      this.configService.get<string>('NODE_ENV', 'development') ===
      'production';

    // Secrets are validated at boot (see env-validation.dto.ts); never fall back to defaults
    this.userAccessSecret = this.configService.getOrThrow<string>(
      'USER_ACCESS_TOKE_SIGNATURE',
    );
    this.userRefreshSecret = this.configService.getOrThrow<string>(
      'USER_REFRISH_TOKE_SIGNATURE',
    );
    this.systemAccessSecret = this.configService.getOrThrow<string>(
      'SYSTEM_ACCESS_TOKE_SIGNATURE',
    );
    this.systemRefreshSecret = this.configService.getOrThrow<string>(
      'SYSTEM_REFRISH_TOKE_SIGNATURE',
    );

    this.accessExpiresIn = isProd
      ? this.configService.get<string>('ACCESS_EXPIRE_IN_PROD', '1d')
      : this.configService.get<string>('ACCESS_EXPIRE_IN_DEV', '1d');

    this.refreshExpiresIn = isProd
      ? this.configService.get<string>('REFRESH_EXPIRE_IN_PROD', '1d')
      : this.configService.get<string>('REFRESH_EXPIRE_IN_DEV', '1d');
  }

  /**
   * Generate signed Access & Refresh JWT token pair using Role-based Signatures
   * (SYSTEM_* signatures for SUPER_ADMIN, ADMIN, BARISTA; USER_* signatures for CUSTOMER)
   */
  async generateTokenPair(user: {
    id: string;
    email: string;
    role: UserRole;
  }): Promise<ITokenPair> {
    const accessJti = randomUUID();
    const refreshJti = randomUUID();
    const isStaff = STAFF_ROLES.includes(user.role);

    const accessSecret = isStaff
      ? this.systemAccessSecret
      : this.userAccessSecret;
    const refreshSecret = isStaff
      ? this.systemRefreshSecret
      : this.userRefreshSecret;

    const accessPayload: IJwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: accessJti,
      type: TokenType.ACCESS,
    };

    const refreshPayload: IJwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      jti: refreshJti,
      type: TokenType.REFRESH,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        secret: accessSecret,
        algorithm: 'HS256',
        expiresIn: this.accessExpiresIn as any,
      }),
      this.jwtService.signAsync(refreshPayload, {
        secret: refreshSecret,
        algorithm: 'HS256',
        expiresIn: this.refreshExpiresIn as any,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.accessExpiresIn,
      refreshTokenExpiresIn: this.refreshExpiresIn,
    };
  }

  /**
   * Verify Access or Refresh token against System or User signatures and check Redis revocation blacklist
   */
  async verifyToken(
    token: string,
    type: TokenType = TokenType.ACCESS,
  ): Promise<IJwtPayload> {
    // Staff tokens must be signed with SYSTEM_* secrets and customer tokens with USER_* secrets.
    // Checking the role against the secret that verified it stops a customer-signed token
    // from claiming a staff role.
    const candidates: Array<{ secret: string; staff: boolean }> =
      type === TokenType.ACCESS
        ? [
            { secret: this.systemAccessSecret, staff: true },
            { secret: this.userAccessSecret, staff: false },
          ]
        : [
            { secret: this.systemRefreshSecret, staff: true },
            { secret: this.userRefreshSecret, staff: false },
          ];

    let payload: IJwtPayload | null = null;
    for (const candidate of candidates) {
      try {
        const verified = await this.jwtService.verifyAsync<IJwtPayload>(token, {
          secret: candidate.secret,
          algorithms: ['HS256'],
        });
        if (STAFF_ROLES.includes(verified.role) === candidate.staff) {
          payload = verified;
        }
        break;
      } catch {
        // Try next candidate secret
      }
    }

    if (!payload) {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }

    if (payload.type !== type) {
      throw new UnauthorizedException(`Invalid token type: expected ${type}`);
    }

    const isRevoked = await this.isTokenRevoked(payload.jti);
    if (isRevoked) {
      throw new UnauthorizedException('Token has been revoked');
    }

    return payload;
  }

  /**
   * Blacklist a token JTI in Redis until its natural expiration
   */
  async revokeToken(jti: string, exp?: number): Promise<void> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const ttlSeconds = exp && exp > nowSeconds ? exp - nowSeconds : 86400;
    await this.cacheService.set(`blacklist:jti:${jti}`, 'revoked', ttlSeconds);
  }

  /**
   * Check whether a token JTI is blacklisted in Redis
   */
  async isTokenRevoked(jti: string): Promise<boolean> {
    const status = await this.cacheService.get<string>(`blacklist:jti:${jti}`);
    return status === 'revoked';
  }

  /**
   * Extract token from Authorization header (supports "Bearer <token>" and "System <token>")
   */
  extractBearerToken(authorizationHeader?: string): string | null {
    if (!authorizationHeader) return null;
    const [scheme, token] = authorizationHeader.trim().split(/\s+/);
    if (
      !scheme ||
      !['bearer', 'system'].includes(scheme.toLowerCase()) ||
      !token
    ) {
      return null;
    }
    return token;
  }
}
