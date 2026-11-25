export class BrandEntity {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  description?: string | null;
  originCountry?: string | null;
  logoUrl?: string | null;
  isActive: boolean;
  productCount?: number;
  createdBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(partial: Partial<BrandEntity>) {
    Object.assign(this, partial);
  }
}
