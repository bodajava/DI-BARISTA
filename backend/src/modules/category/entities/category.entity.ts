export class CategoryEntity {
  id: string;
  name: string;
  nameAr?: string | null;
  slug: string;
  description?: string | null;
  descriptionAr?: string | null;
  imageUrl?: string | null;
  parentId?: string | null;
  position?: number;
  isActive: boolean;
  productCount?: number;
  products?: unknown[];
  createdBy?: string | null;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(partial: Partial<CategoryEntity>) {
    Object.assign(this, partial);
  }
}
