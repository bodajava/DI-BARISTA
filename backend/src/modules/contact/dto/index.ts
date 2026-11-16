import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { CONTACT_MESSAGE_STATUSES, type ContactMessageStatus } from '../../../models/schemas';

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
  @IsIn(['en', 'ar'])
  locale?: string;
}

export class UpdateContactMessageDto {
  @IsIn(CONTACT_MESSAGE_STATUSES as unknown as string[])
  status: ContactMessageStatus;
}
