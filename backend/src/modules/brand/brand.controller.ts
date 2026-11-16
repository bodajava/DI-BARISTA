import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { PaginationQueryDto } from '../../common/dto';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IPaginatedResult } from '../../common/interfaces';
import { ParseMongoIdPipe } from '../../common/pipes';
import { createMulterMemoryOptions } from '../../common/utilities/multer';
import { BrandService } from './brand.service';
import { CreateBrandDto, UpdateBrandDto } from './dto';
import { BrandEntity } from './entities/brand.entity';

@Controller('brands')
@UseGuards(AuthGuard, RolesGuard)
export class BrandController {
  constructor(private readonly brandService: BrandService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo', createMulterMemoryOptions()))
  async create(
    @Body() dto: CreateBrandDto,
    @CurrentUser('sub') userId: string,
    @UploadedFile() logo?: Express.Multer.File,
  ): Promise<BrandEntity> {
    return this.brandService.create(dto, userId, logo);
  }

  @Public()
  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<IPaginatedResult<BrandEntity>> {
    return this.brandService.findAll(query);
  }

  @Public()
  @Get(':identifier')
  async findOne(@Param('identifier') identifier: string): Promise<BrandEntity> {
    return this.brandService.findByIdOrSlug(identifier);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('logo', createMulterMemoryOptions()))
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateBrandDto,
    @UploadedFile() logo?: Express.Multer.File,
  ): Promise<BrandEntity> {
    return this.brandService.update(id, dto, logo);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async remove(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<{ message: string }> {
    return this.brandService.remove(id);
  }
}

