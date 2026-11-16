import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  CACHE_PERSONAL_USER_METADATA,
  CACHE_TTL_METADATA,
} from '../decorators/cache.decorator';
import { IAuthenticatedRequest } from '../interfaces';
import { CacheService } from '../utilities/caching';

interface IRequestUserWithId {
  _id?: unknown;
  sub?: string;
}

@Injectable()
export class CustomCacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CustomCacheInterceptor.name);

  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const contextType = context.getType<string>();

    const ttl =
      this.reflector.getAllAndOverride<number>(CACHE_TTL_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? 10;

    const isPersonal =
      this.reflector.getAllAndOverride<boolean>(CACHE_PERSONAL_USER_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? false;

    let url = '';
    let userId: string | undefined;

    if (contextType === 'http') {
      const req = context
        .switchToHttp()
        .getRequest<
          IAuthenticatedRequest & { user?: IRequestUserWithId }
        >();

      if (req.method && req.method.toUpperCase() !== 'GET') {
        return next.handle();
      }

      url = String(req.originalUrl || req.url || '/');
      const rawUser = req.user as IRequestUserWithId | undefined;
      userId = rawUser?._id
        ? String(rawUser._id)
        : rawUser?.sub
          ? String(rawUser.sub)
          : undefined;
    } else if (contextType === 'graphql') {
      const gqlArgs = context.getArgByIndex<Record<string, unknown>>(1) || {};
      const gqlCtx = context.getArgByIndex<{
        req?: { user?: IRequestUserWithId; originalUrl?: string; url?: string };
      }>(2);
      const gqlInfo = context.getArgByIndex<{
        fieldName?: string;
        parentType?: { name?: string };
      }>(3);

      const parentTypeName = gqlInfo?.parentType?.name || 'Query';
      if (parentTypeName === 'Mutation') {
        return next.handle();
      }

      const fieldName = gqlInfo?.fieldName || context.getHandler().name;
      url = `gql:${parentTypeName}:${fieldName}:${JSON.stringify(gqlArgs)}`;

      const rawUser = gqlCtx?.req?.user;
      userId = rawUser?._id
        ? String(rawUser._id)
        : rawUser?.sub
          ? String(rawUser.sub)
          : undefined;
    } else {
      return next.handle();
    }

    const cacheKey = this.cacheService.getCacheKey(
      url,
      isPersonal ? userId : undefined,
    );

    try {
      const cachedData = await this.cacheService.get(cacheKey);
      if (cachedData !== null && cachedData !== undefined) {
        return of(cachedData);
      }
    } catch (error) {
      this.logger.warn(
        `Cache read failed for key "${cacheKey}", falling back to handler: ${(error as Error).message}`,
      );
    }

    return next.handle().pipe(
      tap((responseData) => {
        if (responseData !== undefined && responseData !== null) {
          this.cacheService
            .set({ key: cacheKey, value: responseData, ttl })
            .catch((err: Error) => {
              this.logger.debug(
                `Cache write skipped for key "${cacheKey}": ${err.message}`,
              );
            });
        }
      }),
    );
  }
}

