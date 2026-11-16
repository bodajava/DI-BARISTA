export class CategoryEntity {
  id: string;
  name: string;
  nameAr?: string;
  slug: string;
  description?: string;
  imageUrl?: string | null;
  isActive: boolean;
  products?: unknown[];
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(partial: Partial<CategoryEntity>) {
    Object.assign(this, partial);
  }
}
