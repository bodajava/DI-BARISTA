import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brand, Category, Prisma, Product, ProductVariant } from '@prisma/client';
import { IPaginatedResult } from '../../common/interfaces';
import { S3Service } from '../../common/services/s3';
import { CacheService } from '../../common/utilities/caching';
import { SlugUtil } from '../../common/utilities/slug';
import {
  ilike,
  isUniqueViolation,
  pageArgs,
  paginated,
  PrismaService,
  toOrderBy,
} from '../../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AdminProductQueryDto,
  CreateProductDto,
  FilterProductDto,
  UpdateProductDto,
  VariantDto,
} from './dto';
import { ProductEntity, ProductVariantView, RefView } from './entities/product.entity';

type ProductWithRelations = Product & {
  brand?: Brand | null;
  category?: Category | null;
  variants?: ProductVariant[];
};

const PRODUCT_INCLUDE = {
  brand: true,
  category: true,
  variants: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.ProductInclude;

const SORTABLE = ['createdAt', 'updatedAt', 'name', 'priceCents', 'finalPriceCents', 'soldCount', 'viewsCount', 'stock'];

@Injectable()
export class ProductService {
  private static readonly CACHE_TTL_SECONDS = 300;
  static readonly CACHE_PREFIX = 'products';
  private static readonly MAX_IMAGES = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    private readonly s3Service: S3Service,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Pricing helpers
  // ---------------------------------------------------------------------------

  /** Regular price + optional sale price → discount % and the price the customer pays */
  private static pricing(priceCents: number, salePriceCents?: number | null, discountPercent?: number) {
    if (salePriceCents !== undefined && salePriceCents !== null) {
      if (salePriceCents >= priceCents) {
        throw new BadRequestException('The sale price must be lower than the price');
      }
      return {
        finalPriceCents: salePriceCents,
        discountPercent: Math.max(0, Math.min(90, Math.round((1 - salePriceCents / priceCents) * 100))),
      };
    }
    const discount = Math.max(0, Math.min(90, discountPercent ?? 0));
    return {
      finalPriceCents: Math.max(1, Math.round(priceCents * (1 - discount / 100))),
      discountPercent: discount,
    };
  }

  /** What a customer pays for a version (its own sale price, else the product's discount) */
  static variantPrice(product: Pick<Product, 'discountPercent'>, variant: ProductVariant): number {
    if (variant.salePriceCents && variant.salePriceCents < variant.priceCents) return variant.salePriceCents;
    return Math.max(1, Math.round(variant.priceCents * (1 - (product.discountPercent || 0) / 100)));
  }

  private async invalidate(): Promise<void> {
    await Promise.all([
      this.cacheService.delByPattern(`${ProductService.CACHE_PREFIX}:*`),
      this.cacheService.delByPattern('categories:*'),
    ]);
  }

  private async uniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = SlugUtil.generate(base) || `piece-${Date.now()}`;
    const taken = await this.prisma.product.findFirst({
      where: { slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (taken) slug = SlugUtil.generate(base, true);
    return slug;
  }

  private async assertRefs(categoryId?: string, brandId?: string | null): Promise<void> {
    if (categoryId) {
      const category = await this.prisma.category.findFirst({ where: { id: categoryId, deletedAt: null } });
      if (!category) throw new NotFoundException('Choose a category that exists');
    }
    if (brandId) {
      const brand = await this.prisma.brand.findFirst({ where: { id: brandId, deletedAt: null } });
      if (!brand) throw new NotFoundException('Choose a brand that exists');
    }
  }

  // ---------------------------------------------------------------------------
  // Create / update / delete
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateProductDto,
    userId: string,
    imageFiles?: Express.Multer.File[],
  ): Promise<ProductEntity> {
    const sku = dto.sku.toUpperCase().trim();
    if (await this.prisma.product.findUnique({ where: { sku }, select: { id: true } })) {
      throw new ConflictException(`A product with SKU "${sku}" already exists`);
    }
    await this.assertRefs(dto.categoryId, dto.brandId);

    const name = (dto.name_en || dto.name).trim();
    const slug = dto.slug?.trim() ? await this.uniqueSlug(dto.slug) : await this.uniqueSlug(name);

    const imageUrls = Array.isArray(dto.imageUrls) ? dto.imageUrls.filter(Boolean) : [];
    const imageKeys: string[] = [];
    if (imageFiles?.length) {
      const uploaded = await this.s3Service.uploadFiles(imageFiles, 'products/images');
      for (const item of uploaded) {
        imageUrls.push(item.url);
        imageKeys.push(item.key);
      }
    }

    const price = ProductService.pricing(dto.priceCents, dto.salePriceCents, dto.discountPercent);
    const isActive = dto.isActive ?? (dto.status ? dto.status === 'ACTIVE' : true);
    const notes = dto.tastingNotes_en?.length ? dto.tastingNotes_en : dto.flavorNotes ?? [];

    const product = await this.prisma.product.create({
      data: {
        name,
        nameAr: dto.name_ar || dto.nameAr || null,
        slug,
        sku,
        shortDescription: dto.shortDescription || null,
        shortDescriptionAr: dto.shortDescriptionAr || null,
        description: dto.description_en || dto.description || null,
        descriptionAr: dto.description_ar || null,
        categoryId: dto.categoryId,
        brandId: dto.brandId || null,
        roastLevel: dto.roastLevel ?? 'MEDIUM',
        ...(dto.availableGrinds ? { availableGrinds: dto.availableGrinds } : {}),
        flavorNotes: notes,
        flavorNotesAr: dto.tastingNotes_ar ?? [],
        originCountry: dto.originCountry,
        originCountryAr: dto.originCountryAr,
        elevation: dto.elevation,
        elevationAr: dto.elevationAr,
        processingMethod: dto.processingMethod,
        processingMethodAr: dto.processingMethodAr,
        weightGrams: dto.weightGrams ?? 250,
        priceCents: dto.priceCents,
        ...price,
        costCents: dto.costCents ?? null,
        stock: dto.stock,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        imageUrls: imageUrls.slice(0, ProductService.MAX_IMAGES),
        imageKeys,
        isActive,
        isFeatured: Boolean(dto.isFeatured),
        createdById: userId,
      },
      include: PRODUCT_INCLUDE,
    });

    await this.invalidate();
    await this.audit.log(userId, 'product.create', 'product', product.id, null, { name, sku });
    return this.toEntity(product, true);
  }

  async update(
    id: string,
    dto: UpdateProductDto,
    imageFiles?: Express.Multer.File[],
    userId?: string,
  ): Promise<ProductEntity> {
    const existing = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This product no longer exists');

    await this.assertRefs(dto.categoryId, dto.brandId);
    const data: Prisma.ProductUncheckedUpdateInput = {};

    const name = dto.name_en || dto.name;
    if (name !== undefined) data.name = name.trim();
    if (dto.name_ar !== undefined || dto.nameAr !== undefined) data.nameAr = (dto.name_ar ?? dto.nameAr) || null;
    if (dto.slug !== undefined && dto.slug.trim() && dto.slug.trim() !== existing.slug) {
      data.slug = await this.uniqueSlug(dto.slug, id);
    }
    if (dto.sku !== undefined) {
      const sku = dto.sku.toUpperCase().trim();
      if (sku !== existing.sku) {
        const dup = await this.prisma.product.findUnique({ where: { sku }, select: { id: true } });
        if (dup && dup.id !== id) throw new ConflictException(`SKU "${sku}" is already in use`);
        data.sku = sku;
      }
    }
    if (dto.shortDescription !== undefined) data.shortDescription = dto.shortDescription || null;
    if (dto.shortDescriptionAr !== undefined) data.shortDescriptionAr = dto.shortDescriptionAr || null;
    const description = dto.description_en ?? dto.description;
    if (description !== undefined) data.description = description || null;
    if (dto.description_ar !== undefined) data.descriptionAr = dto.description_ar || null;
    if (dto.categoryId) data.categoryId = dto.categoryId;
    if (dto.brandId !== undefined) data.brandId = dto.brandId || null;
    if (dto.roastLevel) data.roastLevel = dto.roastLevel;
    if (dto.availableGrinds) data.availableGrinds = dto.availableGrinds;
    const notes = dto.tastingNotes_en ?? dto.flavorNotes;
    if (notes) data.flavorNotes = notes;
    if (dto.tastingNotes_ar) data.flavorNotesAr = dto.tastingNotes_ar;
    for (const key of ['originCountry', 'originCountryAr', 'elevation', 'elevationAr', 'processingMethod', 'processingMethodAr'] as const) {
      if (dto[key] !== undefined) (data as Record<string, unknown>)[key] = dto[key] || null;
    }
    if (dto.weightGrams !== undefined) data.weightGrams = dto.weightGrams;
    if (dto.stock !== undefined) data.stock = dto.stock;
    if (dto.lowStockThreshold !== undefined) data.lowStockThreshold = dto.lowStockThreshold;
    if (dto.costCents !== undefined) data.costCents = dto.costCents;
    if (dto.isFeatured !== undefined) data.isFeatured = dto.isFeatured;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    else if (dto.status !== undefined) data.isActive = dto.status === 'ACTIVE';

    if (dto.priceCents !== undefined || dto.salePriceCents !== undefined || dto.discountPercent !== undefined) {
      const priceCents = dto.priceCents ?? existing.priceCents;
      const sale =
        dto.salePriceCents !== undefined
          ? dto.salePriceCents
          : dto.discountPercent !== undefined
            ? undefined
            : existing.discountPercent > 0
              ? existing.finalPriceCents
              : null;
      Object.assign(data, { priceCents }, ProductService.pricing(priceCents, sale, dto.discountPercent));
    }

    // Photos: the dashboard sends the photos to keep, in display order (first = cover);
    // new uploads go after them. Files removed from the list are deleted from storage.
    if (imageFiles?.length || dto.imageUrls !== undefined) {
      const kept = (dto.imageUrls ?? existing.imageUrls).filter(Boolean);
      const uploaded = imageFiles?.length ? await this.s3Service.uploadFiles(imageFiles, 'products/images') : [];
      const isKept = (key: string) => kept.some((url) => url.endsWith(`/${key}`));
      const removedKeys = existing.imageKeys.filter((key) => !isKept(key));
      if (removedKeys.length) await Promise.all(removedKeys.map((key) => this.s3Service.deleteFile(key)));
      data.imageUrls = [...kept, ...uploaded.map((u) => u.url)].slice(0, ProductService.MAX_IMAGES);
      data.imageKeys = [...existing.imageKeys.filter(isKept), ...uploaded.map((u) => u.key)];
    }

    const updated = await this.prisma.product.update({ where: { id }, data, include: PRODUCT_INCLUDE });
    await this.refreshMaxPrice(id);
    await this.invalidate();
    await this.audit.log(userId, 'product.update', 'product', id, pickAudit(existing), pickAudit(updated));
    return this.toEntity(updated, true);
  }

  async remove(id: string, userId?: string): Promise<{ message: string }> {
    const existing = await this.prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('This product no longer exists');
    await this.prisma.product.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, isFeatured: false } });
    await this.invalidate();
    await this.audit.log(userId, 'product.delete', 'product', id, { name: existing.name }, null);
    return { message: `"${existing.name}" was removed from the store` };
  }

  // ---------------------------------------------------------------------------
  // Versions (variants)
  // ---------------------------------------------------------------------------

  private async refreshMaxPrice(productId: string): Promise<void> {
    const variants = await this.prisma.productVariant.findMany({ where: { productId, isActive: true } });
    const max = variants.length ? Math.max(...variants.map((v) => v.priceCents)) : null;
    await this.prisma.product.update({ where: { id: productId }, data: { maxPriceCents: max } });
  }

  async addVariant(productId: string, dto: VariantDto, userId?: string): Promise<ProductEntity> {
    const product = await this.prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) throw new NotFoundException('This product no longer exists');
    if (dto.salePriceCents && dto.salePriceCents >= dto.priceCents) {
      throw new BadRequestException('The sale price must be lower than the price');
    }
    const count = await this.prisma.productVariant.count({ where: { productId } });
    try {
      await this.prisma.productVariant.create({
        data: {
          productId,
          label: dto.label.trim(),
          labelAr: dto.labelAr?.trim() || null,
          sku: dto.sku?.trim().toUpperCase() || null,
          priceCents: dto.priceCents,
          salePriceCents: dto.salePriceCents ?? null,
          stock: dto.stock ?? null,
          weightGrams: dto.weightGrams ?? null,
          capsulesCount: dto.capsulesCount ?? null,
          isActive: dto.isActive ?? true,
          position: count,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Another version already uses this SKU');
      throw error;
    }
    await this.refreshMaxPrice(productId);
    await this.invalidate();
    await this.audit.log(userId, 'variant.create', 'product', productId, null, { label: dto.label });
    return this.findAdminById(productId);
  }

  async updateVariant(variantId: string, dto: Partial<VariantDto>, userId?: string): Promise<ProductEntity> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('This version no longer exists');
    const price = dto.priceCents ?? variant.priceCents;
    const sale = dto.salePriceCents !== undefined ? dto.salePriceCents : variant.salePriceCents;
    if (sale && sale >= price) throw new BadRequestException('The sale price must be lower than the price');
    try {
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.labelAr !== undefined ? { labelAr: dto.labelAr?.trim() || null } : {}),
          ...(dto.sku !== undefined ? { sku: dto.sku?.trim().toUpperCase() || null } : {}),
          priceCents: price,
          salePriceCents: sale ?? null,
          ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
          ...(dto.weightGrams !== undefined ? { weightGrams: dto.weightGrams } : {}),
          ...(dto.capsulesCount !== undefined ? { capsulesCount: dto.capsulesCount } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          ...(dto.position !== undefined ? { position: dto.position } : {}),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new ConflictException('Another version already uses this SKU');
      throw error;
    }
    await this.refreshMaxPrice(variant.productId);
    await this.invalidate();
    await this.audit.log(userId, 'variant.update', 'product', variant.productId, { label: variant.label }, dto);
    return this.findAdminById(variant.productId);
  }

  async removeVariant(variantId: string, userId?: string): Promise<ProductEntity> {
    const variant = await this.prisma.productVariant.findUnique({ where: { id: variantId } });
    if (!variant) throw new NotFoundException('This version no longer exists');
    await this.prisma.productVariant.delete({ where: { id: variantId } });
    await this.refreshMaxPrice(variant.productId);
    await this.invalidate();
    await this.audit.log(userId, 'variant.delete', 'product', variant.productId, { label: variant.label }, null);
    return this.findAdminById(variant.productId);
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async findAll(query: FilterProductDto, includeInactive = false): Promise<IPaginatedResult<ProductEntity>> {
    const cacheKey = `${ProductService.CACHE_PREFIX}:list:${includeInactive}:${JSON.stringify(query)}`;
    const cached = await this.cacheService.get<IPaginatedResult<ProductEntity>>(cacheKey);
    if (cached) return cached;

    const and: Prisma.ProductWhereInput[] = [{ deletedAt: null }];
    if (!includeInactive) and.push({ isActive: true });
    if (query.roastLevel) and.push({ roastLevel: query.roastLevel });
    if (query.grindType) and.push({ availableGrinds: { has: query.grindType } });
    if (query.categoryId) {
      and.push({ OR: [{ categoryId: query.categoryId }, { extraCategoryIds: { has: query.categoryId } }] });
    }
    if (query.brandId) and.push({ brandId: query.brandId });
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      and.push({ finalPriceCents: { gte: query.minPrice, lte: query.maxPrice } });
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      and.push({
        OR: [
          { name: ilike(q) },
          { nameAr: ilike(q) },
          { sku: ilike(q) },
          { description: ilike(q) },
          { descriptionAr: ilike(q) },
          { originCountry: ilike(q) },
          { originCountryAr: ilike(q) },
          { flavorNotes: { has: q } },
          { flavorNotesAr: { has: q } },
        ],
      });
    }

    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const where: Prisma.ProductWhereInput = { AND: and };
    const [docs, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: toOrderBy(query.sort, SORTABLE),
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
    ]);

    const result = paginated(docs.map((d) => this.toEntity(d)), total, page, limit);
    await this.cacheService.set(cacheKey, result, ProductService.CACHE_TTL_SECONDS);
    return result;
  }

  /** Dashboard list: All / In the store / Hidden / Deleted, category, name or SKU search */
  async findAllForAdmin(query: AdminProductQueryDto) {
    const and: Prisma.ProductWhereInput[] = [];
    switch (query.show) {
      case 'active':
        and.push({ deletedAt: null, isActive: true });
        break;
      case 'hidden':
        and.push({ deletedAt: null, isActive: false });
        break;
      case 'deleted':
        and.push({ deletedAt: { not: null } });
        break;
      default:
        and.push({ deletedAt: null });
    }
    if (query.categoryId) and.push({ categoryId: query.categoryId });
    if (query.search?.trim()) {
      const q = query.search.trim();
      and.push({ OR: [{ name: ilike(q) }, { nameAr: ilike(q) }, { sku: ilike(q) }] });
    }
    const { page, limit, skip, take } = pageArgs(query.page, query.limit);
    const where: Prisma.ProductWhereInput = { AND: and };
    const [docs, total, counts] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: PRODUCT_INCLUDE,
        orderBy: toOrderBy(query.sort, SORTABLE),
        skip,
        take,
      }),
      this.prisma.product.count({ where }),
      Promise.all([
        this.prisma.product.count({ where: { deletedAt: null } }),
        this.prisma.product.count({ where: { deletedAt: null, isActive: true } }),
        this.prisma.product.count({ where: { deletedAt: null, isActive: false } }),
        this.prisma.product.count({ where: { deletedAt: { not: null } } }),
      ]),
    ]);
    const [all, active, hidden, deleted] = counts;
    const result = paginated(docs.map((d) => this.toEntity(d, true)), total, page, limit);
    // Counts ride in meta: the response interceptor only forwards docs + meta
    return { docs: result.docs, meta: { ...result.meta, counts: { all, active, hidden, deleted } } as typeof result.meta };
  }

  async findAdminById(id: string): Promise<ProductEntity> {
    const product = await this.prisma.product.findUnique({ where: { id }, include: PRODUCT_INCLUDE });
    if (!product) throw new NotFoundException('This product no longer exists');
    return this.toEntity(product, true);
  }

  private findBySlugOrId(identifier: string) {
    const key = identifier.trim();
    return this.prisma.product.findFirst({
      where: { deletedAt: null, OR: [{ id: key }, { slug: key.toLowerCase() }] },
      include: PRODUCT_INCLUDE,
    });
  }

  /** Read-only product detail (SSR metadata etc.), never counts a view */
  async findBySlugPeek(slugOrId: string): Promise<ProductEntity> {
    const product = await this.findBySlugOrId(slugOrId);
    if (!product) throw new NotFoundException(`Product "${slugOrId}" not found`);
    return this.toEntity(product);
  }

  /**
   * Count at most one view per visitor per product every 6 hours, so refreshing the page
   * (or a script) can't inflate the analytics.
   */
  async findBySlugAndCountView(slugOrId: string, viewerId?: string): Promise<ProductEntity> {
    const product = await this.findBySlugOrId(slugOrId);
    if (!product) throw new NotFoundException(`Product "${slugOrId}" not found`);
    if (!viewerId) return this.toEntity(product);

    const viewKey = `views:${product.id}:${viewerId}`;
    if (!(await this.cacheService.exists(viewKey))) {
      await this.cacheService.set(viewKey, 1, 6 * 60 * 60);
      await this.prisma.$transaction([
        this.prisma.product.update({ where: { id: product.id }, data: { viewsCount: { increment: 1 } } }),
        this.prisma.productView.create({ data: { productId: product.id, visitorId: viewerId.slice(0, 120) } }),
      ]);
      product.viewsCount += 1;
    }
    return this.toEntity(product);
  }

  async findLowStock(limit = 50) {
    const products = await this.prisma.$queryRaw<
      Array<{ id: string; name: string; nameAr: string | null; sku: string; stock: number; lowStockThreshold: number; imageUrl: string | null }>
    >`
      SELECT id, name, "nameAr", sku, stock, "lowStockThreshold", "imageUrls"[1] AS "imageUrl"
      FROM products
      WHERE "deletedAt" IS NULL AND "isActive" = true AND stock <= "lowStockThreshold"
      ORDER BY stock ASC, name ASC
      LIMIT ${limit}`;
    const variants = await this.prisma.productVariant.findMany({
      where: {
        isActive: true,
        stock: { not: null, lte: 5 },
        product: { deletedAt: null, isActive: true },
      },
      include: { product: { select: { id: true, name: true, nameAr: true, imageUrls: true, lowStockThreshold: true } } },
      take: limit,
      orderBy: { stock: 'asc' },
    });
    return [
      ...products.map((p) => ({
        productId: p.id,
        variantId: null,
        name: p.name,
        nameAr: p.nameAr,
        variantLabel: null,
        sku: p.sku,
        stock: p.stock,
        threshold: p.lowStockThreshold,
        imageUrl: p.imageUrl,
      })),
      ...variants
        .filter((v) => (v.stock ?? 0) <= v.product.lowStockThreshold)
        .map((v) => ({
          productId: v.productId,
          variantId: v.id,
          name: v.product.name,
          nameAr: v.product.nameAr,
          variantLabel: v.label,
          sku: v.sku ?? '',
          stock: v.stock ?? 0,
          threshold: v.product.lowStockThreshold,
          imageUrl: v.product.imageUrls[0] ?? null,
        })),
    ]
      .sort((a, b) => a.stock - b.stock)
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  static toRef(ref: (Brand | Category) | null | undefined): RefView | null {
    if (!ref) return null;
    return {
      id: ref.id,
      name: ref.name,
      nameAr: ref.nameAr,
      slug: ref.slug,
      ...('logoUrl' in ref ? { logoUrl: ref.logoUrl, originCountry: ref.originCountry } : {}),
      ...('imageUrl' in ref ? { imageUrl: ref.imageUrl, parentId: ref.parentId } : {}),
    };
  }

  toEntity(product: ProductWithRelations, forAdmin = false): ProductEntity {
    const variants: ProductVariantView[] = (product.variants ?? [])
      .filter((v) => forAdmin || v.isActive)
      .map((v) => ({
        id: v.id,
        label: v.label,
        labelAr: v.labelAr,
        sku: v.sku,
        priceCents: ProductService.variantPrice(product, v),
        regularPriceCents: v.priceCents,
        salePriceCents: v.salePriceCents,
        stock: v.stock,
        weightGrams: v.weightGrams,
        capsulesCount: v.capsulesCount,
        isActive: v.isActive,
        position: v.position,
      }));
    const category = ProductService.toRef(product.category) ?? product.categoryId;
    return new ProductEntity({
      id: product.id,
      name: product.name,
      nameAr: product.nameAr,
      name_en: product.name,
      name_ar: product.nameAr,
      slug: product.slug,
      sku: product.sku,
      shortDescription: product.shortDescription,
      shortDescriptionAr: product.shortDescriptionAr,
      description: product.description,
      description_en: product.description,
      description_ar: product.descriptionAr,
      brandId: ProductService.toRef(product.brand) ?? product.brandId,
      categoryId: category,
      categoryIds: [category, ...product.extraCategoryIds],
      roastLevel: product.roastLevel,
      availableGrinds: product.availableGrinds,
      flavorNotes: product.flavorNotes,
      tastingNotes_en: product.flavorNotes,
      tastingNotes_ar: product.flavorNotesAr,
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
      salePriceCents: product.discountPercent > 0 ? product.finalPriceCents : null,
      variants,
      stock: product.stock,
      soldCount: product.soldCount,
      viewsCount: product.viewsCount,
      imageUrls: product.imageUrls,
      status: product.isActive ? 'ACTIVE' : 'DRAFT',
      isFeatured: product.isFeatured,
      isActive: product.isActive,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      ...(forAdmin
        ? {
            costCents: product.costCents,
            lowStockThreshold: product.lowStockThreshold,
            isDeleted: Boolean(product.deletedAt),
            deletedAt: product.deletedAt,
            createdBy: product.createdById,
          }
        : {}),
    });
  }
}

function pickAudit(p: Product) {
  return {
    name: p.name,
    sku: p.sku,
    priceCents: p.priceCents,
    finalPriceCents: p.finalPriceCents,
    stock: p.stock,
    isActive: p.isActive,
    isFeatured: p.isFeatured,
  };
}
