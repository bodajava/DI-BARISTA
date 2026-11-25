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
import { STAFF_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { ParseIdPipe } from '../../common/pipes';
import { ContactService } from './contact.service';
import { ContactQueryDto, CreateContactMessageDto, UpdateContactMessageDto } from './dto';

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
  @Roles(...STAFF_ROLES)
  async findAll(@Query() query: ContactQueryDto) {
    return this.contactService.findAll(query);
  }

  @Patch('messages/:id')
  @Roles(...STAFF_ROLES)
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateContactMessageDto,
  ) {
    return this.contactService.updateStatus(id, dto);
  }

  @Delete('messages/:id')
  @Roles(...STAFF_ROLES)
  async remove(@Param('id', ParseIdPipe) id: string) {
    return this.contactService.remove(id);
  }
}
