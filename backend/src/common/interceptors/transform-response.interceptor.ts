import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponseDto } from '../dto';

@Injectable()
export class TransformResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponseDto<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponseDto<T>> {
    return next.handle().pipe(
      map((res) => {
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

