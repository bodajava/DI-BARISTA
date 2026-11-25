import { GrindType } from '../../../common/enums';

export interface ICartItemView {
  itemId: string;
  productId: string;
  variantId?: string | null;
  sku: string;
  name: string;
  unitPriceCents: number;
  quantity: number;
  selectedGrind: GrindType;
  variantLabel?: string;
  variantLabelAr?: string;
  lineTotalCents: number;
  product?: unknown;
}

export class CartEntity {
  id: string;
  guestSessionId: string;
  userId?: string | null;
  items: ICartItemView[];
  totalItemsCount: number;
  subTotalCents: number;
  updatedAt?: Date;

  constructor(partial: Partial<CartEntity>) {
    Object.assign(this, partial);
  }
}

