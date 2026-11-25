import { PaginationQueryDto } from '../../../common/dto';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ContactStatus } from '@prisma/client';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateContactMessageDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({ require_tld: true }, { message: 'Please enter a valid email address' })
  @MaxLength(254)
  email: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  name?: string;

  @Transform(trim)
  @IsString()
  @MinLength(10, { message: 'Message must be at least 10 characters' })
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(150)
  subject?: string;

  @IsOptional()
  @IsIn(['en', 'ar'])
  locale?: string;
}

export class UpdateContactMessageDto {
  @IsIn(Object.values(ContactStatus))
  status: ContactStatus;
}

export class ContactQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsIn(Object.values(ContactStatus))
  status?: ContactStatus;

  @IsOptional()
  @IsIn(['0', '1', 'true', 'false'])
  unread?: string;
}
