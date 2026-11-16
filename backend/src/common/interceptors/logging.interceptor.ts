import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpCtx = context.switchToHttp();
    const request = httpCtx.getRequest<Request>();
    const response = httpCtx.getResponse<Response>();
    const { method, originalUrl, ip } = request;
    const startTime = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - startTime;
          this.logger.log(
            `${method} ${originalUrl} ${response.statusCode} - ${duration}ms [${ip}]`,
          );
        },
        error: (err: { status?: number; message?: string }) => {
          const duration = Date.now() - startTime;
          const status = err?.status || 500;
          this.logger.error(
            `${method} ${originalUrl} ${status} - ${duration}ms [${ip}] - ${err?.message}`,
          );
        },
      }),
    );
  }
}

