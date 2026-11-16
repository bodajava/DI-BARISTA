import { GrindType, RoastLevel } from '../../../common/enums';
import {
  ProductPublishStatus,
  ProductVariant,
} from '../../../models/schemas/product.schema';

export class ProductEntity {
  id: string;
  name: string;
  nameAr?: string;
  name_en?: string;
  name_ar?: string;
  slug: string;
  sku: string;
  description?: string;
  description_en?: string;
  description_ar?: string;
  brandId: unknown;
  categoryId: unknown;
  categoryIds?: unknown[];
  roastLevel: RoastLevel;
  availableGrinds: GrindType[];
  flavorNotes: string[];
  tastingNotes_en?: string[];
  tastingNotes_ar?: string[];
  originCountry?: string;
  originCountryAr?: string;
  elevation?: string;
  elevationAr?: string;
  processingMethod?: string;
  processingMethodAr?: string;
  weightGrams: number;
  priceCents: number;
  maxPriceCents?: number;
  discountPercent: number;
  finalPriceCents: number;
  variants?: ProductVariant[];
  stock: number;
  soldCount: number;
  viewsCount: number;
  imageUrls: string[];
  status?: ProductPublishStatus;
  isFeatured?: boolean;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(partial: Partial<ProductEntity>) {
    Object.assign(this, partial);
  }
}
