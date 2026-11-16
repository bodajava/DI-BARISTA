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

  @Public()
  @Get(':slug')
  async findOne(@Param('slug') slug: string): Promise<CategoryEntity> {
    return this.categoryService.findBySlugWithProducts(slug);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', createMulterMemoryOptions()))
  async create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser('sub') userId: string,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    return this.categoryService.create(dto, userId, image);
  }

  @Patch(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('image', createMulterMemoryOptions()))
  async update(
    @Param('id', ParseMongoIdPipe) id: string,
    @Body() dto: UpdateCategoryDto,
    @UploadedFile() image?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    return this.categoryService.update(id, dto, image);
  }

  @Delete(':id')
  @Roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)
  async remove(
    @Param('id', ParseMongoIdPipe) id: string,
  ): Promise<{ message: string }> {
    return this.categoryService.remove(id);
  }
}
