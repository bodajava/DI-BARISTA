import { IPaginationMeta } from '../interfaces';

export class ApiResponseDto<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  meta?: IPaginationMeta;
  timestamp: string;

  constructor(partial: Partial<ApiResponseDto<T>>) {
    this.success = partial.success ?? true;
    this.message = partial.message ?? 'Operation completed successfully';
    this.data = partial.data;
    this.meta = partial.meta;
    this.timestamp = new Date().toISOString();
  }
}

