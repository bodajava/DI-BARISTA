import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Response } from 'express';
import { TokenType } from '../common/enums';
import { IAuthenticatedRequest } from '../common/interfaces';
import { TokenService } from '../common/services/token';

/**
 * Guest session ids are issued by the server as `guest_<uuid>`. Anything else is rejected so a
 * client can't pass e.g. `user_<id>` and read the cart that belongs to a logged-in customer.
 */
export const GUEST_SESSION_ID_PATTERN =
  /^guest_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(private readonly tokenService: TokenService) {}

  async use(
    req: IAuthenticatedRequest,
    _res: Response,
    next: NextFunction,
  ): Promise<void> {
    const guestHeader = req.headers['x-guest-session-id'];
    if (
      typeof guestHeader === 'string' &&
      GUEST_SESSION_ID_PATTERN.test(guestHeader.trim())
    ) {
      req.guestSessionId = guestHeader.trim();
    }
    delete req.headers['x-guest-session-id'];

    const token = this.tokenService.extractBearerToken(
      req.headers.authorization,
    );

    if (token) {
      try {
        req.user = await this.tokenService.verifyToken(token, TokenType.ACCESS);
      } catch {
        // An expired/invalid token must not break public routes (catalog, cart).
        // Protected routes are still rejected by AuthGuard, which re-verifies the header.
        req.user = undefined;
      }
    }

    next();
  }
}
