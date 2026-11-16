import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FilterQuery, Types } from 'mongoose';
import { IPaginatedResult } from '../../common/interfaces';
import { S3Service } from '../../common/services/s3';
import { CacheService } from '../../common/utilities/caching';
import { SlugUtil } from '../../common/utilities/slug';
import {
  BrandRepository,
  CategoryRepository,
  ProductRepository,
} from '../../models/repositories';
import { ProductDocument } from '../../models/schemas';
import {
  CreateProductDto,
  FilterProductDto,
  UpdateProductDto,
} from './dto';
import { ProductEntity } from './entities/product.entity';
import { escapeRegex } from '../../common/utilities/regex';

@Injectable()
export class ProductService {
  private static readonly CACHE_TTL_SECONDS = 300;
  private static readonly CACHE_PREFIX = 'products';

  constructor(
    private readonly productRepository: ProductRepository,
    private readonly brandRepository: BrandRepository,
    private readonly categoryRepository: CategoryRepository,
    private readonly cacheService: CacheService,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    dto: CreateProductDto,
    userId: string,
    imageFiles?: Express.Multer.File[],
  ): Promise<ProductEntity> {
    const normalizedSku = dto.sku.toUpperCase().trim();
    const existingSku = await this.productRepository.findBySku(normalizedSku);
    if (existingSku) {
      throw new ConflictException(
        `Product with SKU "${normalizedSku}" already exists`,
      );
    }

    const [brandExists, categoryExists] = await Promise.all([
      this.brandRepository.exists({ _id: dto.brandId }),
      this.categoryRepository.exists({ _id: dto.categoryId }),
    ]);

    if (!brandExists) {
      throw new NotFoundException(`Brand with id "${dto.brandId}" not found`);
    }
    if (!categoryExists) {
      throw new NotFoundException(
        `Category with id "${dto.categoryId}" not found`,
      );
    }

    let slug = SlugUtil.generate(dto.name);
    const slugTaken = await this.productRepository.exists({ slug });
    if (slugTaken) {
      slug = SlugUtil.generate(dto.name, true);
    }

    const imageUrls: string[] = Array.isArray(dto.imageUrls)
      ? [...dto.imageUrls]
      : [];
    const imageKeys: string[] = [];

    if (imageFiles && imageFiles.length > 0) {
      const uploaded = await this.s3Service.uploadFiles(
        imageFiles,
        'products/images',
      );
      for (const item of uploaded) {
        imageUrls.push(item.url);
        imageKeys.push(item.key);
      }
    }

    const discount = dto.discountPercent ?? 0;
    const finalPriceCents = Math.max(
      1,
      Math.round(dto.priceCents * (1 - discount / 100)),
    );

    const isActive = dto.isActive ?? (dto.status ? dto.status === 'ACTIVE' : true);
    const status = dto.status ?? (isActive ? 'ACTIVE' : 'DRAFT');

    const product = await this.productRepository.create({
      ...dto,
      name: dto.name_en || dto.name,
      name_en: dto.name_en || dto.name,
      nameAr: dto.name_ar || dto.nameAr,
      name_ar: dto.name_ar || dto.nameAr,
      description: dto.description_en || dto.description,
      description_en: dto.description_en || dto.description,
      flavorNotes: dto.tastingNotes_en?.length
        ? dto.tastingNotes_en
        : dto.flavorNotes || [],
      tastingNotes_en: dto.tastingNotes_en?.length
        ? dto.tastingNotes_en
        : dto.flavorNotes || [],
      tastingNotes_ar: dto.tastingNotes_ar || [],
      sku: normalizedSku,
      slug,
      brandId: new Types.ObjectId(dto.brandId),
      categoryId: new Types.ObjectId(dto.categoryId),
      finalPriceCents,
      imageUrls,
      imageKeys,
      isActive,
      status,
      createdBy: new Types.ObjectId(userId),
    });

    await this.cacheService.delByPattern(`${ProductService.CACHE_PREFIX}:*`);
    return this.toEntity(product);
  }

  async findAll(
    query: FilterProductDto,
    includeInactive = false,
  ): Promise<IPaginatedResult<ProductEntity>> {
    const cacheKey = `${ProductService.CACHE_PREFIX}:list:${includeInactive}:${JSON.stringify(query)}`;
    const cached =
      await this.cacheService.get<IPaginatedResult<ProductEntity>>(cacheKey);
    if (cached) {
      return cached;
    }

    const filter: FilterQuery<ProductDocument> = includeInactive
      ? {}
      : { isActive: true };

    if (query.roastLevel) {
      filter.roastLevel = query.roastLevel;
    }

    if (query.grindType) {
      filter.availableGrinds = query.grindType;
    }

    if (query.categoryId) {
      const catObjectId = new Types.ObjectId(query.categoryId);
      filter.$and = [
        ...(filter.$and || []),
        { $or: [{ categoryId: catObjectId }, { categoryIds: catObjectId }] },
      ];
    }

    if (query.brandId) {
      filter.brandId = new Types.ObjectId(query.brandId);
    }

    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const priceFilter: Record<string, number> = {};
      if (query.minPrice !== undefined) priceFilter.$gte = query.minPrice;
      if (query.maxPrice !== undefined) priceFilter.$lte = query.maxPrice;
      filter.finalPriceCents = priceFilter;
    }

    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search.trim().slice(0, 100)), 'i');
      filter.$or = [
        { name: regex },
        { nameAr: regex },
        { name_en: regex },
        { name_ar: regex },
        { description: regex },
        { description_en: regex },
        { description_ar: regex },
        { originCountry: regex },
        { originCountryAr: regex },
        { flavorNotes: regex },
        { tastingNotes_en: regex },
        { tastingNotes_ar: regex },
      ];
    }

    const paginated = await this.productRepository.paginate(
      filter,
      query.page,
      query.limit,
      {
        sort: query.sort,
        populate: ['brandId', 'categoryId'],
      },
    );

    const result: IPaginatedResult<ProductEntity> = {
      docs: paginated.docs.map((doc) => this.toEntity(doc)),
      meta: paginated.meta,
    };

    await this.cacheService.set(
      cacheKey,
      result,
      ProductService.CACHE_TTL_SECONDS,
    );
    return result;
  }

  /**
   * Read-only product detail lookup for SSR metadata/detail without incrementing view analytics
   */
  async findBySlugPeek(slugOrId: string): Promise<ProductEntity> {
    const product = await this.productRepository.findBySlugOrId(slugOrId);
    if (!product) {
      throw new NotFoundException(`Coffee product "${slugOrId}" not found`);
    }
    return this.toEntity(product);
  }

  /**
   * Public product detail: increments viewsCount and returns product details
   */
  /**
   * Count at most one view per visitor per product every 6 hours, so refreshing the page
   * (or a script) can't inflate the analytics and AI demand forecasts.
   */
  async findBySlugAndCountView(
    slugOrId: string,
    viewerId?: string,
  ): Promise<ProductEntity> {
    if (!viewerId) {
      return this.findBySlugPeek(slugOrId);
    }
    const viewKey = `views:${slugOrId}:${viewerId}`;
    if (await this.cacheService.exists(viewKey)) {
      return this.findBySlugPeek(slugOrId);
    }
    const product = await this.findBySlugAndIncrementViews(slugOrId);
    await this.cacheService.set(viewKey, 1, 6 * 60 * 60);
    return product;
  }

  async findBySlugAndIncrementViews(slugOrId: string): Promise<ProductEntity> {
    const product =
      await this.productRepository.findAndIncrementViews(slugOrId);
    if (!product) {
      throw new NotFoundException(`Coffee product "${slugOrId}" not found`);
    }
    return this.toEntity(product);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    imageFiles?: Express.Multer.File[],
  ): Promise<ProductEntity> {
    const existing = await this.productRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    const updatePayload: Record<string, unknown> = { ...dto };

    if (dto.name_en && !dto.name) {
      updatePayload.name = dto.name_en;
    } else if (dto.name && !dto.name_en) {
      updatePayload.name_en = dto.name;
    }
    if (dto.name_ar && !dto.nameAr) {
      updatePayload.nameAr = dto.name_ar;
    } else if (dto.nameAr && !dto.name_ar) {
      updatePayload.name_ar = dto.nameAr;
    }
    if (dto.description_en && !dto.description) {
      updatePayload.description = dto.description_en;
    } else if (dto.description && !dto.description_en) {
      updatePayload.description_en = dto.description;
    }
    if (dto.tastingNotes_en?.length && !dto.flavorNotes) {
      updatePayload.flavorNotes = dto.tastingNotes_en;
    } else if (dto.flavorNotes?.length && !dto.tastingNotes_en) {
      updatePayload.tastingNotes_en = dto.flavorNotes;
    }

    const nextName = (updatePayload.name as string | undefined) ?? dto.name;
    if (nextName && nextName !== existing.name) {
      updatePayload.slug = SlugUtil.generate(nextName, true);
    }

    if (dto.sku && dto.sku.toUpperCase().trim() !== existing.sku) {
      const normalizedSku = dto.sku.toUpperCase().trim();
      const duplicateSku = await this.productRepository.findBySku(normalizedSku);
      if (duplicateSku && duplicateSku.id !== existing.id) {
        throw new ConflictException(`SKU "${normalizedSku}" is already in use`);
      }
      updatePayload.sku = normalizedSku;
    }

    if (dto.brandId) {
      updatePayload.brandId = new Types.ObjectId(dto.brandId);
    }

    if (dto.categoryId) {
      updatePayload.categoryId = new Types.ObjectId(dto.categoryId);
    }

    const priceCents = dto.priceCents ?? existing.priceCents;
    const discountPercent = dto.discountPercent ?? existing.discountPercent;
    updatePayload.finalPriceCents = Math.max(
      1,
      Math.round(priceCents * (1 - discountPercent / 100)),
    );

    if (dto.isActive !== undefined && dto.status === undefined) {
      updatePayload.status = dto.isActive ? 'ACTIVE' : 'DRAFT';
    } else if (dto.status !== undefined && dto.isActive === undefined) {
      updatePayload.isActive = dto.status === 'ACTIVE';
    }

    // Images: keep the list sent by the dashboard (order = display order, first = cover),
    // append new uploads, and delete from S3 only the files that were removed.
    if ((imageFiles && imageFiles.length > 0) || dto.imageUrls !== undefined) {
      const kept = (dto.imageUrls ?? existing.imageUrls ?? []).filter(Boolean);
      const uploaded = imageFiles?.length
        ? await this.s3Service.uploadFiles(imageFiles, 'products/images')
        : [];
      const existingKeys = existing.imageKeys ?? [];
      const isKept = (key: string) => kept.some((url) => url.endsWith(`/${key}`));
      const removedKeys = existingKeys.filter((key) => !isKept(key));
      if (removedKeys.length) {
        await Promise.all(removedKeys.map((key) => this.s3Service.deleteFile(key)));
      }
      updatePayload.imageUrls = [...kept, ...uploaded.map((u) => u.url)].slice(0, 10);
      updatePayload.imageKeys = [
        ...existingKeys.filter(isKept),
        ...uploaded.map((u) => u.key),
      ];
    }

    const updated = await this.productRepository.findByIdAndUpdate(id, {
      $set: updatePayload,
    });

    await this.cacheService.delByPattern(`${ProductService.CACHE_PREFIX}:*`);
    return this.toEntity(updated ?? existing);
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.productRepository.softDelete(id);
    if (!deleted) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    await this.cacheService.delByPattern(`${ProductService.CACHE_PREFIX}:*`);
    return { message: `Product "${deleted.name}" removed successfully` };
  }

  private toEntity(product: ProductDocument): ProductEntity {
    const raw = product as unknown as { createdAt?: Date; updatedAt?: Date };
    const nameEn = product.name_en || product.name;
    const nameAr = product.name_ar || product.nameAr;
    const descriptionEn = product.description_en || product.description;
    const tastingNotesEn = product.tastingNotes_en?.length
      ? product.tastingNotes_en
      : product.flavorNotes;
    return new ProductEntity({
      id: product.id,
      name: nameEn,
      nameAr,
      name_en: nameEn,
      name_ar: nameAr,
      slug: product.slug,
      sku: product.sku,
      description: descriptionEn,
      description_en: descriptionEn,
      description_ar: product.description_ar,
      brandId: product.brandId,
      categoryId: product.categoryId,
      categoryIds: product.categoryIds || [product.categoryId],
      roastLevel: product.roastLevel,
      availableGrinds: product.availableGrinds,
      flavorNotes: tastingNotesEn,
      tastingNotes_en: tastingNotesEn,
      tastingNotes_ar: product.tastingNotes_ar || [],
      originCountry: product.originCountry,
      originCountryAr: product.originCountryAr,
      elevation: product.elevation,
      elevationAr: product.elevationAr,
      processingMethod: product.processingMethod,
      processingMethodAr: product.processingMethodAr,
      weightGrams: product.weightGrams,
      priceCents: product.priceCents,
      maxPriceCents: product.maxPriceCents,
      discountPercent: product.discountPercent,
      finalPriceCents: product.finalPriceCents,
      variants: product.variants || [],
      stock: product.stock,
      soldCount: product.soldCount,
      viewsCount: product.viewsCount ?? 0,
      imageUrls: product.imageUrls,
      status: product.status || (product.isActive ? 'ACTIVE' : 'DRAFT'),
      isFeatured: Boolean(product.isFeatured),
      isActive: product.isActive,
      createdBy: product.createdBy ? String(product.createdBy) : undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}

