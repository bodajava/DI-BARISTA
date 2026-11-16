import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Public, RateLimit, Roles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { ParseMongoIdPipe } from '../../common/pipes';
import { ContactService } from './contact.service';
import { CreateContactMessageDto, UpdateContactMessageDto } from './dto';

@Controller('contact')
@UseGuards(AuthGuard, RolesGuard)
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /** Public: footer "send us a message" form */
  @Public()
  @RateLimit({ limit: 3, windowSeconds: 10 * 60, bodyKey: 'email' })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateContactMessageDto) {
    return this.contactService.create(dto);
  }

  @Get('messages')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findAll(@Query() query: PaginationQueryDto, @Query('status') status?: string) {
    return this.contactService.findAll({ ...query, status });
  }

  @Patch('messages/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateContactMessageDto,
  ) {
    return this.contactService.updateStatus(id, dto);
  }

  @Delete('messages/:id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async remove(@Param('id', ParseMongoIdPipe) id: string) {
    return this.contactService.remove(id);
  }
}
