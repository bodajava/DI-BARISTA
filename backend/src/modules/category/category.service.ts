import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Category, Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../common/dto';
import { IPaginatedResult } from '../../common/interfaces';
import { S3Service } from '../../common/services/s3';
import { CacheService } from '../../common/utilities/caching';
import { SlugUtil } from '../../common/utilities/slug';
import { ilike, pageArgs, paginated, PrismaService, toOrderBy } from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ProductService } from '../product/product.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { CategoryEntity } from './entities/category.entity';

@Injectable()
export class CategoryService {
  private static readonly CACHE_TTL_SECONDS = 300;
  private static readonly CACHE_PREFIX = 'categories';

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly s3Service: S3Service,
    private readonly productService: ProductService,
    private readonly audit: AuditService,
  ) {}

  private async invalidate(): Promise<void> {
    await Promise.all([
      this.cacheService.delByPattern(`${CategoryService.CACHE_PREFIX}:*`),
      this.cacheService.delByPattern('products:*'),
    ]);
  }

  private async assertUnique(name: string, slug: string, excludeId?: string): Promise<void> {
    const duplicate = await this.prisma.category.findFirst({
      where: {
        ...(excludeId ? { id: { not: excludeId } } : {}),
        OR: [{ name: { equals: name.trim(), mode: 'insensitive' } }, { slug }],
      },
    });
    if (duplicate) throw new ConflictException(`A category called "${name}" already exists`);
  }

  /** A category can't sit inside itself or inside one of its own children */
  private async assertParent(parentId: string | null | undefined, selfId?: string): Promise<void> {
    if (!parentId) return;
    if (parentId === selfId) throw new BadRequestException('A category cannot sit inside itself');
    let cursor: string | null = parentId;
    for (let depth = 0; cursor && depth < 20; depth += 1) {
      const node: Pick<Category, 'id' | 'parentId'> | null = await this.prisma.category.findFirst({
        where: { id: cursor, deletedAt: null },
        select: { id: true, parentId: true },
      });
      if (!node) throw new NotFoundException('The parent category no longer exists');
      if (selfId && node.parentId === selfId) {
        throw new BadRequestException('A category cannot sit inside one of its own sub-categories');
      }
      cursor = node.parentId;
    }
  }

  async create(dto: CreateCategoryDto, userId: string, imageFile?: Express.Multer.File): Promise<CategoryEntity> {
    const slug = SlugUtil.generate(dto.slug?.trim() || dto.name);
    await this.assertUnique(dto.name, slug);
    await this.assertParent(dto.parentId);

    const uploaded = imageFile ? await this.s3Service.uploadFile(imageFile, 'categories/images') : null;
    const category = await this.prisma.category.create({
      data: {
        name: dto.name.trim(),
        nameAr: dto.nameAr?.trim() || null,
        slug,
        description: dto.description || null,
        descriptionAr: dto.descriptionAr || null,
        parentId: dto.parentId || null,
        isActive: dto.isActive ?? true,
        imageUrl: uploaded?.url ?? null,
        imageKey: uploaded?.key ?? null,
        createdById: userId,
      },
    });
    await this.invalidate();
    await this.audit.log(userId, 'category.create', 'category', category.id, null, { name: category.name });
    return this.toEntity(category);
  }

  async findAll(query: PaginationQueryDto, includeHidden = false): Promise<IPaginatedResult<CategoryEntity>> {
    const cacheKey = `${CategoryService.CACHE_PREFIX}:list:${includeHidden}:${JSON.stringify(query)}`;
    const cached = await this.cacheService.get<IPaginatedResult<CategoryEntity>>(cacheKey);
    if (cached) return cached;

    const where: Prisma.CategoryWhereInput = {
      deletedAt: null,
      ...(includeHidden ? {} : { isActive: true }),
      ...(query.search?.trim() ? { OR: [{ name: ilike(query.search) }, { nameAr: ilike(query.search) }] } : {}),
    };
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const [docs, total] = await Promise.all([
      this.prisma.category.findMany({
        where,
        orderBy: toOrderBy(query.sort, ['createdAt', 'name', 'position'], { position: 'asc' }),
        skip,
        take,
        include: { _count: { select: { products: { where: { deletedAt: null } } } } },
      }),
      this.prisma.category.count({ where }),
    ]);
    const result = paginated(
      docs.map((d) => this.toEntity(d, undefined, d._count.products)),
      total,
      page,
      limit,
    );
    await this.cacheService.set(cacheKey, result, CategoryService.CACHE_TTL_SECONDS);
    return result;
  }

  /** Dashboard: every category (hidden too) with product counts, for the tree */
  async findAllForAdmin(): Promise<CategoryEntity[]> {
    const docs = await this.prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ position: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: { where: { deletedAt: null } } } } },
    });
    return docs.map((d) => this.toEntity(d, undefined, d._count.products));
  }

  /** Public category by slug or id, with its active products (and its sub-categories' products) */
  async findBySlugWithProducts(slugOrId: string): Promise<CategoryEntity> {
    const cacheKey = `${CategoryService.CACHE_PREFIX}:detail:${slugOrId}`;
    const cached = await this.cacheService.get<CategoryEntity>(cacheKey);
    if (cached) return cached;

    const category = await this.prisma.category.findFirst({
      where: { deletedAt: null, OR: [{ id: slugOrId }, { slug: slugOrId.toLowerCase() }] },
      include: { children: { where: { deletedAt: null, isActive: true }, select: { id: true } } },
    });
    if (!category) throw new NotFoundException(`Category "${slugOrId}" not found`);

    const ids = [category.id, ...category.children.map((c) => c.id)];
    const products = await this.prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        OR: [{ categoryId: { in: ids } }, { extraCategoryIds: { hasSome: ids } }],
      },
      include: { brand: true, category: true, variants: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    const entity = this.toEntity(
      category,
      products.map((p) => this.productService.toEntity(p)),
    );
    await this.cacheService.set(cacheKey, entity, CategoryService.CACHE_TTL_SECONDS);
    return entity;
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    imageFile?: Express.Multer.File,
    userId?: string,
  ): Promise<CategoryEntity> {
    const existing = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This category no longer exists');

    const data: Prisma.CategoryUncheckedUpdateInput = {};
    if (dto.name !== undefined || dto.slug !== undefined) {
      const name = dto.name?.trim() || existing.name;
      const slug = SlugUtil.generate(dto.slug?.trim() || (dto.name ? name : existing.slug));
      await this.assertUnique(name, slug, id);
      data.name = name;
      data.slug = slug;
    }
    if (dto.nameAr !== undefined) data.nameAr = dto.nameAr?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description || null;
    if (dto.descriptionAr !== undefined) data.descriptionAr = dto.descriptionAr || null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.parentId !== undefined) {
      await this.assertParent(dto.parentId, id);
      data.parentId = dto.parentId || null;
    }
    if (imageFile) {
      const uploaded = await this.s3Service.uploadFile(imageFile, 'categories/images');
      if (existing.imageKey) await this.s3Service.deleteFile(existing.imageKey);
      data.imageUrl = uploaded.url;
      data.imageKey = uploaded.key;
    }

    const updated = await this.prisma.category.update({ where: { id }, data });
    await this.invalidate();
    await this.audit.log(userId, 'category.update', 'category', id, { name: existing.name }, data);
    return this.toEntity(updated);
  }

  async remove(id: string, userId?: string): Promise<{ message: string }> {
    const existing = await this.prisma.category.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This category no longer exists');
    const inUse = await this.prisma.product.count({ where: { categoryId: id, deletedAt: null } });
    if (inUse > 0) {
      throw new BadRequestException(
        `${inUse} product(s) are still in this category. Move them to another category first.`,
      );
    }
    await this.prisma.$transaction([
      this.prisma.category.updateMany({ where: { parentId: id }, data: { parentId: existing.parentId } }),
      this.prisma.category.update({
        where: { id },
        // Free the unique name/slug so a new category can reuse them
        data: {
          deletedAt: new Date(),
          isActive: false,
          name: `${existing.name}__deleted_${Date.now()}`,
          slug: `${existing.slug}--deleted-${Date.now()}`,
        },
      }),
    ]);
    await this.invalidate();
    await this.audit.log(userId, 'category.delete', 'category', id, { name: existing.name }, null);
    return { message: `Category "${existing.name}" removed` };
  }

  private toEntity(category: Category, products?: unknown[], productCount?: number): CategoryEntity {
    return new CategoryEntity({
      id: category.id,
      name: category.name,
      nameAr: category.nameAr,
      slug: category.slug,
      description: category.description,
      descriptionAr: category.descriptionAr,
      imageUrl: category.imageUrl,
      parentId: category.parentId,
      position: category.position,
      isActive: category.isActive,
      ...(productCount !== undefined ? { productCount } : {}),
      ...(products !== undefined ? { products } : {}),
      createdBy: category.createdById,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt,
    });
  }
}
