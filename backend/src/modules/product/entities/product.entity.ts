export interface ProductVariantView {
  id: string;
  label: string;
  labelAr?: string | null;
  sku?: string | null;
  /** Price the customer pays for this version */
  priceCents: number;
  regularPriceCents: number;
  salePriceCents?: number | null;
  stock?: number | null;
  weightGrams?: number | null;
  capsulesCount?: number | null;
  isActive: boolean;
  position: number;
}

export interface RefView {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  [key: string]: unknown;
}

export class ProductEntity {
  id: string;
  name: string;
  nameAr?: string | null;
  name_en?: string;
  name_ar?: string | null;
  slug: string;
  sku: string;
  shortDescription?: string | null;
  shortDescriptionAr?: string | null;
  description?: string | null;
  description_en?: string | null;
  description_ar?: string | null;
  brandId: RefView | string | null;
  categoryId: RefView | string;
  categoryIds?: Array<RefView | string>;
  roastLevel: string;
  availableGrinds: string[];
  flavorNotes: string[];
  tastingNotes_en?: string[];
  tastingNotes_ar?: string[];
  originCountry?: string | null;
  originCountryAr?: string | null;
  elevation?: string | null;
  elevationAr?: string | null;
  processingMethod?: string | null;
  processingMethodAr?: string | null;
  weightGrams: number;
  priceCents: number;
  maxPriceCents?: number | null;
  discountPercent: number;
  finalPriceCents: number;
  salePriceCents?: number | null;
  costCents?: number | null;
  variants?: ProductVariantView[];
  stock: number;
  lowStockThreshold?: number;
  soldCount: number;
  viewsCount: number;
  imageUrls: string[];
  status?: 'ACTIVE' | 'DRAFT';
  isFeatured?: boolean;
  isActive: boolean;
  isDeleted?: boolean;
  createdBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;

  constructor(partial: Partial<ProductEntity>) {
    Object.assign(this, partial);
  }
}
