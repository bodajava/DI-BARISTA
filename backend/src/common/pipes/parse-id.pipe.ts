import { ArgumentMetadata, BadRequestException, Injectable, PipeTransform } from '@nestjs/common';

/** Database ids: cuid for new rows, 24-hex for rows migrated from MongoDB */
export const ID_PATTERN = /^[a-z0-9]{20,32}$/i;

@Injectable()
export class ParseIdPipe implements PipeTransform<string, string> {
  transform(value: string, metadata: ArgumentMetadata): string {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      throw new BadRequestException(`Invalid id for ${metadata.data || 'parameter'}`);
    }
    return value;
  }
}
