import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class AdminChatQueryDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsArray()
  history?: Array<{ role: 'user' | 'assistant' | 'model'; content: string }>;
}
