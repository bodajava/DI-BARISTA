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
import { ADMIN_ROLES, STAFF_ROLES } from '../../common/enums';
import { AuthGuard, RolesGuard } from '../../common/guards';
import { IPaginatedResult } from '../../common/interfaces';
import { ParseIdPipe } from '../../common/pipes';
import { createMulterMemoryOptions } from '../../common/utilities/multer';
import { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { CategoryEntity } from './entities/category.entity';

@Controller('categories')
@UseGuards(AuthGuard, RolesGuard)
export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  @Public()
  @Get()
  async findAll(
    @Query() query: PaginationQueryDto,
  ): Promise<IPaginatedResult<CategoryEntity>> {
    return this.categoryService.findAll(query);
  }

  @Get('admin/all')
  @Roles(...STAFF_ROLES)
  findAllForAdmin(): Promise<CategoryEntity[]> {
    return this.categoryService.findAllForAdmin();
  }

  @Public()
  @Get(':slug')
  async findOne(@Param('slug') slug: string): Promise<CategoryEntity> {
    return this.categoryService.findBySlugWithProducts(slug);
  }

  @Post()
  @Roles(...ADMIN_ROLES)
  @UseInterceptors(FileInterceptor('image', createMulterMemoryOptions()))
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser('sub') userId: string,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    return this.categoryService.create(dto, userId, image);
  }

  @Patch(':id')
  @Roles(...ADMIN_ROLES)
  @UseInterceptors(FileInterceptor('image', createMulterMemoryOptions()))
  async update(
    @Param('id', ParseIdPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @CurrentUser('sub') userId: string,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    return this.categoryService.update(id, dto, image, userId);
  }

  @Delete(':id')
  @Roles(...ADMIN_ROLES)
  async remove(
    @Param('id', ParseIdPipe) id: string,
    @CurrentUser('sub') userId: string,
  ): Promise<{ message: string }> {
    return this.categoryService.remove(id, userId);
  }
}
