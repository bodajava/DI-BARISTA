import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators';
import { TokenType } from '../enums';
import { IAuthenticatedRequest } from '../interfaces';
import { TokenService } from '../services/token';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokenService: TokenService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<IAuthenticatedRequest>();

    // Reuse payload if already verified by AuthMiddleware
    if (request.user) {
      return true;
    }

    const token = this.tokenService.extractBearerToken(
      request.headers.authorization,
    );
    if (!token) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization Bearer token',
      );
    }

    request.user = await this.tokenService.verifyToken(token, TokenType.ACCESS);
    return true;
  }
}

