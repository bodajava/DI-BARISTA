import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Brand, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto';
import { IPaginatedResult } from '../../common/interfaces';
import { S3Service } from '../../common/services/s3';
import { CacheService } from '../../common/utilities/caching';
import { SlugUtil } from '../../common/utilities/slug';
import { ilike, pageArgs, paginated, PrismaService, toOrderBy } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateBrandDto, UpdateBrandDto } from './dto';
import { BrandEntity } from './entities/brand.entity';

@Injectable()
export class BrandService {
  private static readonly CACHE_TTL_SECONDS = 300;
  private static readonly CACHE_PREFIX = 'brands';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly s3Service: S3Service,
    private readonly audit: AuditService,
  ) {}

  private async invalidate(): Promise<void> {
    await Promise.all([
      this.cacheService.delByPattern(`${BrandService.CACHE_PREFIX}:*`),
      this.cacheService.delByPattern('products:*'),
    ]);
  }

  private async assertUnique(name: string, slug: string, excludeId?: string): Promise<void> {
    const duplicate = await this.prisma.brand.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ name: { equals: name.trim(), mode: 'insensitive' } }, { slug }],
      },
    });
    if (duplicate) throw new ConflictException(`A brand called "${name}" already exists`);
  }

  async create(dto: CreateBrandDto, userId: string, logoFile?: Express.Multer.File): Promise<BrandEntity> {
    const slug = SlugUtil.generate(dto.slug?.trim() || dto.name);
    await this.assertUnique(dto.name, slug);
    const uploaded = logoFile ? await this.s3Service.uploadFile(logoFile, 'brands/logos') : null;
    const brand = await this.prisma.brand.create({
      data: {
        name: dto.name.trim(),
        nameAr: dto.nameAr?.trim() || null,
        slug,
        description: dto.description || null,
        originCountry: dto.originCountry || null,
        isActive: dto.isActive ?? true,
        logoUrl: uploaded?.url ?? null,
        logoKey: uploaded?.key ?? null,
        createdById: userId,
      },
    });
    await this.invalidate();
    await this.audit.log(userId, 'brand.create', 'brand', brand.id, null, { name: brand.name });
    return this.toEntity(brand);
  }

  async findAll(query: PaginationQueryDto): Promise<IPaginatedResult<BrandEntity>> {
    const cacheKey = `${BrandService.CACHE_PREFIX}:list:${JSON.stringify(query)}`;
    const cached = await this.cacheService.get<IPaginatedResult<BrandEntity>>(cacheKey);
    if (cached) return cached;

    const where: Prisma.BrandWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(query.search?.trim()
        ? { OR: [{ name: ilike(query.search) }, { nameAr: ilike(query.search) }, { originCountry: ilike(query.search) }] }
        : {}),
    };
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const [docs, total] = await Promise.all([
      this.prisma.brand.findMany({ where, orderBy: toOrderBy(query.sort, ['createdAt', 'name']), skip, take }),
      this.prisma.brand.count({ where }),
    ]);
    const result = paginated(docs.map((d) => this.toEntity(d)), total, page, limit);
    await this.cacheService.set(cacheKey, result, BrandService.CACHE_TTL_SECONDS);
    return result;
  }

  async findAllForAdmin(): Promise<BrandEntity[]> {
    const docs = await this.prisma.brand.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    return docs.map((d) => this.toEntity(d, d._count.products));
  }

  async findByIdOrSlug(identifier: string): Promise<BrandEntity> {
    const brand = await this.prisma.brand.findFirst({
      where: { deletedAt: null, OR: [{ id: identifier }, { slug: identifier.toLowerCase() }] },
    });
    if (!brand) throw new NotFoundException(`Brand "${identifier}" not found`);
    return this.toEntity(brand);
  }

  async update(id: string, dto: UpdateBrandDto, logoFile?: Express.Multer.File, userId?: string): Promise<BrandEntity> {
    const existing = await this.prisma.brand.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This brand no longer exists');

    const data: Prisma.BrandUpdateInput = {};
    if (dto.name !== undefined || dto.slug !== undefined) {
      const name = dto.name?.trim() || existing.name;
      const slug = SlugUtil.generate(dto.slug?.trim() || (dto.name ? name : existing.slug));
      await this.assertUnique(name, slug, id);
      data.name = name;
      data.slug = slug;
    }
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.originCountry !== undefined) data.originCountry = dto.originCountry || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (logoFile) {
      const uploaded = await this.s3Service.uploadFile(logoFile, 'brands/logos');
      if (existing.logoKey) await this.s3Service.deleteFile(existing.logoKey);
      data.logoUrl = uploaded.url;
      data.logoKey = uploaded.key;
    }
    const updated = await this.prisma.brand.update({ where: { id }, data });
    await this.invalidate();
    await this.audit.log(userId, 'brand.update', 'brand', id, { name: existing.name }, data);
    return this.toEntity(updated);
  }

  async remove(id: string, userId?: string): Promise<{ message: string }> {
    const existing = await this.prisma.brand.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This brand no longer exists');
    const inUse = await this.prisma.product.count({ where: { brandId: id, deletedAt: null } });
    if (inUse > 0) {
      throw new BadRequestException(`${inUse} product(s) still use this brand. Change their brand first.`);
    }
    await this.prisma.brand.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        name: `${existing.name}__deleted_${Date.now()}`,
        slug: `${existing.slug}--deleted-${Date.now()}`,
      },
    });
    await this.invalidate();
    await this.audit.log(userId, 'brand.delete', 'brand', id, { name: existing.name }, null);
    return { message: `Brand "${existing.name}" removed` };
  }

  private toEntity(brand: Brand, productCount?: number): BrandEntity {
    return new BrandEntity({
      id: brand.id,
      name: brand.name,
      nameAr: brand.nameAr,
      slug: brand.slug,
      description: brand.description,
      originCountry: brand.originCountry,
      logoUrl: brand.logoUrl,
      isActive: brand.isActive,
      ...(productCount !== undefined ? { productCount } : {}),
      createdBy: brand.createdById,
      createdAt: brand.createdAt,
      updatedAt: brand.updatedAt,
    });
  }
}
