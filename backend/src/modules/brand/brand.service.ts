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
import { BrandRepository } from '../../models/repositories';
import { BrandDocument } from '../../models/schemas';
import { CreateBrandDto, UpdateBrandDto } from './dto';
import { BrandEntity } from './entities/brand.entity';
import { escapeRegex } from '../../common/utilities/regex';

@Injectable()
export class BrandService {
  private static readonly CACHE_TTL_SECONDS = 300; // 5 minutes
  private static readonly CACHE_PREFIX = 'brands';

  constructor(
    private readonly brandRepository: BrandRepository,
    private readonly cacheService: CacheService,
    private readonly s3Service: S3Service,
  ) {}

  async create(
    dto: CreateBrandDto,
    userId: string,
    logoFile?: Express.Multer.File,
  ): Promise<BrandEntity> {
    const slug = SlugUtil.generate(dto.name);
    const existing = await this.brandRepository.findByNameOrSlug(
      dto.name,
      slug,
    );
    if (existing) {
      throw new ConflictException(
        `Brand with name "${dto.name}" or slug "${slug}" already exists`,
      );
    }

    let logoUrl: string | null = null;
    let logoKey: string | null = null;

    if (logoFile) {
      const uploadResult = await this.s3Service.uploadFile(
        logoFile,
        'brands/logos',
      );
      logoUrl = uploadResult.url;
      logoKey = uploadResult.key;
    }

    const brand = await this.brandRepository.create({
      ...dto,
      slug,
      logoUrl,
      logoKey,
      createdBy: new Types.ObjectId(userId),
    });

    await this.cacheService.delByPattern(`${BrandService.CACHE_PREFIX}:*`);
    return this.toEntity(brand);
  }

  async findAll(
    query: PaginationQueryDto,
  ): Promise<IPaginatedResult<BrandEntity>> {
    const cacheKey = `${BrandService.CACHE_PREFIX}:list:${JSON.stringify(query)}`;
    const cached =
      await this.cacheService.get<IPaginatedResult<BrandEntity>>(cacheKey);
    if (cached) {
      return cached;
    }

    const filter: FilterQuery<BrandDocument> = {};
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search.trim().slice(0, 100)), 'i');
      filter.$or = [
        { name: regex },
        { nameAr: regex },
        { originCountry: regex },
      ];
    }

    const paginated = await this.brandRepository.paginate(
      filter,
      query.page,
      query.limit,
      { sort: query.sort },
    );

    const result: IPaginatedResult<BrandEntity> = {
      docs: paginated.docs.map((doc) => this.toEntity(doc)),
      meta: paginated.meta,
    };

    await this.cacheService.set(
      cacheKey,
      result,
      BrandService.CACHE_TTL_SECONDS,
    );
    return result;
  }

  async findByIdOrSlug(identifier: string): Promise<BrandEntity> {
    const cacheKey = `${BrandService.CACHE_PREFIX}:item:${identifier}`;
    const cached = await this.cacheService.get<BrandEntity>(cacheKey);
    if (cached) {
      return cached;
    }

    const isObjectId = Types.ObjectId.isValid(identifier);
    const brand = isObjectId
      ? await this.brandRepository.findById(identifier)
      : await this.brandRepository.findBySlug(identifier);

    if (!brand) {
      throw new NotFoundException(`Coffee brand "${identifier}" not found`);
    }

    const entity = this.toEntity(brand);
    await this.cacheService.set(
      cacheKey,
      entity,
      BrandService.CACHE_TTL_SECONDS,
    );
    return entity;
  }

  async update(
    id: string,
    dto: UpdateBrandDto,
    logoFile?: Express.Multer.File,
  ): Promise<BrandEntity> {
    const existing = await this.brandRepository.findById(id);
    if (!existing) {
      throw new NotFoundException(`Coffee brand with id "${id}" not found`);
    }

    const updatePayload: Record<string, unknown> = { ...dto };

    if (dto.name && dto.name !== existing.name) {
      const newSlug = SlugUtil.generate(dto.name);
      const duplicate = await this.brandRepository.findOne({
        _id: { $ne: existing._id },
        $or: [{ name: dto.name }, { slug: newSlug }],
      });
      if (duplicate) {
        throw new ConflictException(
          `Another brand with name "${dto.name}" already exists`,
        );
      }
      updatePayload.slug = newSlug;
    }

    if (logoFile) {
      const uploadResult = await this.s3Service.uploadFile(
        logoFile,
        'brands/logos',
      );
      if (existing.logoKey) {
        await this.s3Service.deleteFile(existing.logoKey);
      }
      updatePayload.logoUrl = uploadResult.url;
      updatePayload.logoKey = uploadResult.key;
    }

    const updated = await this.brandRepository.findByIdAndUpdate(id, {
      $set: updatePayload,
    });

    await this.cacheService.delByPattern(`${BrandService.CACHE_PREFIX}:*`);
    return this.toEntity(updated ?? existing);
  }

  async remove(id: string): Promise<{ message: string }> {
    const deleted = await this.brandRepository.softDelete(id);
    if (!deleted) {
      throw new NotFoundException(`Coffee brand with id "${id}" not found`);
    }

    await this.cacheService.delByPattern(`${BrandService.CACHE_PREFIX}:*`);
    return { message: `Brand "${deleted.name}" removed successfully` };
  }

  private toEntity(brand: BrandDocument): BrandEntity {
    const raw = brand as unknown as { createdAt?: Date; updatedAt?: Date };
    return new BrandEntity({
      id: brand.id,
      name: brand.name,
      nameAr: brand.nameAr,
      slug: brand.slug,
      description: brand.description,
      originCountry: brand.originCountry,
      logoUrl: brand.logoUrl,
      isActive: brand.isActive,
      createdBy: brand.createdBy ? String(brand.createdBy) : undefined,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    });
  }
}

