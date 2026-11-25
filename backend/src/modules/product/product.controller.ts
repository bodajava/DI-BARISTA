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
import { ADMIN_ROLES, STAFF_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IPaginatedResult } from '../../common/interfaces';
import { ParseIdPipe } from '../../common/pipes';
import { createMulterMemoryOptions } from '../../common/utilities/multer';
import {
  AdminProductQueryDto,
  CreateProductDto,
  FilterProductDto,
  UpdateProductDto,
  UpdateVariantDto,
  VariantDto,
} from './dto';
import { ProductEntity } from './entities/product.entity';
import { ProductService } from './product.service';

const imageUpload = () => FilesInterceptor('images', 8, createMulterMemoryOptions());

@Controller('products')
@UseGuards(AuthGuard, RolesGuard)
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Public()
  @Get()
  findAll(@Query() query: FilterProductDto): Promise<IPaginatedResult<ProductEntity>> {
    return this.productService.findAll(query, false);
  }

  @Get('admin/all')
  @Roles(...STAFF_ROLES)
  findAllForAdmin(@Query() query: AdminProductQueryDto) {
    return this.productService.findAllForAdmin(query);
  }

  @Get('admin/:id')
  @Roles(...STAFF_ROLES)
  findAdminById(@Param('id', ParseIdPipe) id: string): Promise<ProductEntity> {
    return this.productService.findAdminById(id);
  }

  @Public()
  @Get(':slug')
  findOne(
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
  @Roles(...ADMIN_ROLES)
  @UseInterceptors(imageUpload())
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser('sub') userId: string,
    @UploadedFiles() images?: Express.Multer.File[],
  ): Promise<ProductEntity> {
    return this.productService.create(dto, userId, images);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @UseInterceptors(imageUpload())
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('sub') userId: string,
    @UploadedFiles() images?: Express.Multer.File[],
  ): Promise<ProductEntity> {
    return this.productService.update(id, dto, images, userId);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@Param('id', ParseIdPipe) id: string, @CurrentUser('sub') userId: string) {
    return this.productService.remove(id, userId);
  }

  @Post(':id/variants')
  @Roles(...ADMIN_ROLES)
  addVariant(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: VariantDto,
    @CurrentUser('sub') userId: string,
  ): Promise<ProductEntity> {
    return this.productService.addVariant(id, dto, userId);
  }
}

@Controller('variants')
@UseGuards(AuthGuard, RolesGuard)
export class VariantController {
  constructor(private readonly productService: ProductService) {}

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateVariantDto,
    @CurrentUser('sub') userId: string,
  ): Promise<ProductEntity> {
    return this.productService.updateVariant(id, dto, userId);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  remove(@Param('id', ParseIdPipe) id: string, @CurrentUser('sub') userId: string): Promise<ProductEntity> {
    return this.productService.removeVariant(id, userId);
  }
}
