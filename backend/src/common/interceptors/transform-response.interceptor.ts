import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../dto';

/**
 * The storefront and dashboard were written against MongoDB, which returned `_id` next to `id`.
 * Keep that contract: every plain object with an `id` also gets `_id`.
 */
export function withLegacyIds(value: unknown, depth = 0): unknown {
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  if (Array.isArray(value)) return value.map((v) => withLegacyIds(v, depth + 1));
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(source)) out[key] = withLegacyIds(v, depth + 1);
  if (typeof source.id === 'string' && !('_id' in source)) out._id = source.id;
  return out;
}

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponseDto<T> | StreamableFile>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseDto<T> | StreamableFile> {
    return next.handle().pipe(
      map((raw) => {
        if (raw instanceof StreamableFile) return raw;
        const res = withLegacyIds(raw) as any;
        if (raw instanceof ApiResponseDto) {
          return raw;
        }
        if (res instanceof ApiResponseDto) {
          return res;
        }
        if (
          res &&
          typeof res === 'object' &&
          'docs' in res &&
          'meta' in res
        ) {
          return new ApiResponseDto({
            success: true,
            message: res.message || 'Data retrieved successfully',
            data: res.docs,
            meta: res.meta,
          });
        }
        if (
          res &&
          typeof res === 'object' &&
          'message' in res &&
          'data' in res
        ) {
          return new ApiResponseDto({
            success: true,
            message: res.message,
            data: res.data,
            meta: res.meta,
          });
        }
        return new ApiResponseDto({
          success: true,
          message: 'Operation completed successfully',
          data: res,
        });
      }),
    );
  }
}

