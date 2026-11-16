export class BrandEntity {
  id: string;
  name: string;
  nameAr?: string;
  slug: string;
  description?: string;
  originCountry?: string;
  logoUrl?: string | null;
  isActive: boolean;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(partial: Partial<BrandEntity>) {
    Object.assign(this, partial);
  }
}

