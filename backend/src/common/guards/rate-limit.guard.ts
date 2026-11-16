import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { IRateLimitOptions, RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import { RateLimitService } from '../services/rate-limit';

/**
 * Global guard: only acts on handlers decorated with @RateLimit().
 * Client IP comes from req.ip, which honours the TRUST_PROXY setting in main.ts.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<IRateLimitOptions>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!options) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    const keys = [`${route}:ip:${ip}`];
    if (options.bodyKey) {
      const raw = (req.body as Record<string, unknown> | undefined)?.[
        options.bodyKey
      ];
      if (typeof raw === 'string' && raw.trim()) {
        keys.push(`${route}:${options.bodyKey}:${raw.trim().toLowerCase()}`);
      }
    }

    for (const key of keys) {
      const result = await this.rateLimitService.hit(
        key,
        options.limit,
        options.windowSeconds,
      );
      if (!result.allowed) {
        res.setHeader('Retry-After', String(result.retryAfterSeconds));
        throw new HttpException(
          'Too many requests. Please wait a moment and try again.',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }

    return true;
  }
}
