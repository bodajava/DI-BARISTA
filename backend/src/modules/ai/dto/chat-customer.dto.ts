import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ConversationHistoryItemDto {
  @IsString()
  @IsIn(['user', 'model'])
  role: 'user' | 'model';

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

export class ChatCustomerDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => ConversationHistoryItemDto)
  conversationHistory?: ConversationHistoryItemDto[];
}

