import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FilterQuery, Types } from 'mongoose';
import { PaginationQueryDto } from '../../common/dto';
import { IPaginatedResult } from '../../common/interfaces';
import { S3Service } from '../../common/services/s3';
import { CacheService } from '../../common/utilities/caching';
import { SlugUtil } from '../../common/utilities/slug';
import {
  CategoryRepository,
  ProductRepository,
} from '../../models/repositories';
import { CategoryDocument } from '../../models/schemas';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { CategoryEntity } from './entities/category.entity';
import { escapeRegex } from '../../common/utilities/regex';

@Injectable()
export class CategoryService {
  private static readonly CACHE_TTL_SECONDS = 300;
  private static readonly CACHE_PREFIX = 'categories';

  constructor(
    private readonly categoryRepository: CategoryRepository,
    private readonly productRepository: ProductRepository,
    private readonly cacheService: CacheService,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    dto: CreateCategoryDto,
    userId: string,
    imageFile?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    const slug = SlugUtil.generate(dto.name);
    const existing = await this.categoryRepository.findByNameOrSlug(
      dto.name,
      slug,
    );
    if (existing) {
      throw new ConflictException(
        `Category with name "${dto.name}" or slug "${slug}" already exists`,
      );
    }

    let imageUrl: string | null = null;
    let imageKey: string | null = null;

    if (imageFile) {
      const uploaded = await this.s3Service.uploadFile(
        imageFile,
        'categories/images',
      );
      imageUrl = uploaded.url;
      imageKey = uploaded.key;
    }

    const category = await this.categoryRepository.create({
      ...dto,
      slug,
      imageUrl,
      imageKey,
      createdBy: new Types.ObjectId(userId),
    });

    await this.cacheService.delByPattern(`${CategoryService.CACHE_PREFIX}:*`);
    return this.toEntity(category);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<IPaginatedResult<CategoryEntity>> {
    const cacheKey = `${CategoryService.CACHE_PREFIX}:list:${JSON.stringify(query)}`;
    const cached =
      await this.cacheService.get<IPaginatedResult<CategoryEntity>>(cacheKey);
    if (cached) {
      return cached;
    }

    const filter: FilterQuery<CategoryDocument> = {};
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search.trim().slice(0, 100)), 'i');
      filter.$or = [{ name: regex }, { nameAr: regex }];
    }

    const paginated = await this.categoryRepository.paginate(
      filter,
      query.page,
      query.limit,
      { sort: query.sort },
    );

    const result: IPaginatedResult<CategoryEntity> = {
      docs: paginated.docs.map((doc) => this.toEntity(doc)),
      meta: paginated.meta,
    };

    await this.cacheService.set(
      cacheKey,
      result,
      CategoryService.CACHE_TTL_SECONDS,
    );
    return result;
  }

  /**
   * Public category detail by slug or ObjectId with associated active products
   */
  async findBySlugWithProducts(slugOrId: string): Promise<CategoryEntity> {
    const cacheKey = `${CategoryService.CACHE_PREFIX}:detail:${slugOrId}`;
    const cached = await this.cacheService.get<CategoryEntity>(cacheKey);
    if (cached) {
      return cached;
    }

    const isObjectId = Types.ObjectId.isValid(slugOrId);
    const category = isObjectId
      ? await this.categoryRepository.findById(slugOrId)
      : await this.categoryRepository.findBySlug(slugOrId);

    if (!category) {
      throw new NotFoundException(`Category "${slugOrId}" not found`);
    }

    const products = await this.productRepository.findAll(
      {
        $or: [{ categoryId: category._id }, { categoryIds: category._id }],
        isActive: true,
      },
      { sort: '-createdAt', populate: ['brandId'] },
    );

    const entity = this.toEntity(category, products);
    await this.cacheService.set(
      cacheKey,
      entity,
      CategoryService.CACHE_TTL_SECONDS,
    );
    return entity;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    imageFile?: Express.Multer.File,
  ): Promise<CategoryEntity> {
    const existing = await this.categoryRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    const updatePayload: Record<string, unknown> = { ...dto };

    if (dto.name && dto.name !== existing.name) {
      const newSlug = SlugUtil.generate(dto.name);
      const duplicate = await this.categoryRepository.findOne({
        _id: { $ne: existing._id },
        $or: [{ name: dto.name }, { slug: newSlug }],
      });
      if (duplicate) {
        throw new ConflictException(
          `Another category with name "${dto.name}" already exists`,
        );
      }
      updatePayload.slug = newSlug;
    }

    if (imageFile) {
      const uploaded = await this.s3Service.uploadFile(
        imageFile,
        'categories/images',
      );
      if (existing.imageKey) {
        await this.s3Service.deleteFile(existing.imageKey);
      }
      updatePayload.imageUrl = uploaded.url;
      updatePayload.imageKey = uploaded.key;
    }

    const updated = await this.categoryRepository.findByIdAndUpdate(id, {
      $set: updatePayload,
    });

    await this.cacheService.delByPattern(`${CategoryService.CACHE_PREFIX}:*`);
    return this.toEntity(updated ?? existing);
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.categoryRepository.softDelete(id);
    if (!deleted) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    await this.cacheService.delByPattern(`${CategoryService.CACHE_PREFIX}:*`);
    return { message: `Category "${deleted.name}" removed successfully` };
  }

  private toEntity(
    category: CategoryDocument,
    products?: unknown[],
  ): CategoryEntity {
    const raw = category as unknown as { createdAt?: Date; updatedAt?: Date };
    return new CategoryEntity({
      id: category.id,
      name: category.name,
      nameAr: category.nameAr,
      slug: category.slug,
      description: category.description,
      imageUrl: category.imageUrl,
      isActive: category.isActive,
      ...(products !== undefined ? { products } : {}),
      createdBy: category.createdBy ? String(category.createdBy) : undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}
