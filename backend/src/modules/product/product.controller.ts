import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CurrentUser, GuestSession, Public, Roles } from '../../common/decorators';
import { UserRole } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IPaginatedResult } from '../../common/interfaces';
import { ParseMongoIdPipe } from '../../common/pipes';
import { createMulterMemoryOptions } from '../../common/utilities/multer';
import {
  CreateProductDto,
  FilterProductDto,
  UpdateProductDto,
} from './dto';
import { ProductEntity } from './entities/product.entity';
import { ProductService } from './product.service';

@Controller('products')
@UseGuards(AuthGuard, RolesGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Public()
  @Get()
  async findAll(
    @Query() query: FilterProductDto,
  ): Promise<IPaginatedResult<ProductEntity>> {
    return this.productService.findAll(query, false);
  }

  @Get('admin/all')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async findAllForAdmin(
    @Query() query: FilterProductDto,
  ): Promise<IPaginatedResult<ProductEntity>> {
    return this.productService.findAll(query, true);
  }

  @Public()
  @Get(':slug')
  async findOne(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Query('peek') peek?: string,
    @GuestSession() guestSessionId?: string,
  ): Promise<ProductEntity> {
    if (peek === '1' || peek === 'true') {
      return this.productService.findBySlugPeek(slug);
    }
    return this.productService.findBySlugAndCountView(slug, guestSessionId || req.ip);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 5, createMulterMemoryOptions()))
  async create(
    @Body() dto: CreateProductDto,
    @CurrentUser('sub') userId: string,
    @UploadedFiles() images?: Express.Multer.File[],
  ): Promise<ProductEntity> {
    return this.productService.create(dto, userId, images);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images', 5, createMulterMemoryOptions()))
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateProductDto,
    @UploadedFiles() images?: Express.Multer.File[],
  ): Promise<ProductEntity> {
    return this.productService.update(id, dto, images);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async remove(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<{ message: string }> {
    return this.productService.remove(id);
  }
}

