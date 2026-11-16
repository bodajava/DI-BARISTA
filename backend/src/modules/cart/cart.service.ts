import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Types } from 'mongoose';
import { GrindType } from '../../common/enums';
import { IJwtPayload } from '../../common/interfaces';
import {
  CartRepository,
  ProductRepository,
} from '../../models/repositories';
import { CartDocument, ProductDocument } from '../../models/schemas';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { CartEntity, ICartItemView } from './entities/cart.entity';

@Injectable()
export class CartService {
  constructor(
    private readonly cartRepository: CartRepository,
    private readonly productRepository: ProductRepository,
  ) {}

  async getActiveCart(
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<CartEntity> {
    const effectiveSessionId =
      guestSessionId || (user ? `user_${user.sub}` : `guest_${randomUUID()}`);

    const cart = await this.cartRepository.findActiveCart({
      userId: user?.sub,
      guestSessionId: effectiveSessionId,
    });

    if (!cart) {
      return new CartEntity({
        id: '',
        guestSessionId: effectiveSessionId,
        userId: user?.sub ?? null,
        items: [],
        totalItemsCount: 0,
        subTotalCents: 0,
      });
    }

    return this.toEntity(cart);
  }

  async addItem(
    dto: AddToCartDto,
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<CartEntity> {
    if (!dto.productId && !dto.sku) {
      throw new BadRequestException(
        'Either productId or sku must be provided to add an item to cart',
      );
    }

    const product: ProductDocument | null = dto.productId
      ? await this.productRepository.findById(dto.productId)
      : await this.productRepository.findBySku(dto.sku!);

    if (!product || !product.isActive) {
      throw new NotFoundException('Requested coffee product not found or inactive');
    }

    const selectedGrind = dto.selectedGrind ?? GrindType.WHOLE_BEAN;
    if (
      product.availableGrinds?.length &&
      !product.availableGrinds.includes(selectedGrind)
    ) {
      throw new BadRequestException(
        `Grind "${selectedGrind}" is not available for "${product.name}". Available grinds: ${product.availableGrinds.join(', ')}`,
      );
    }

    const effectiveSessionId =
      guestSessionId || (user ? `user_${user.sub}` : `guest_${randomUUID()}`);

    const matchedVariant = dto.variantLabel
      ? product.variants?.find(
          (v) => v.label.toLowerCase() === dto.variantLabel?.trim().toLowerCase(),
        )
      : undefined;
    const discount = product.discountPercent || 0;
    const unitPriceCents = matchedVariant
      ? Math.max(1, Math.round(matchedVariant.priceCents * (1 - discount / 100)))
      : product.finalPriceCents;
    const variantLabel = matchedVariant?.label;
    const variantLabelAr = matchedVariant?.labelAr;

    let cart = await this.cartRepository.findActiveCart({
      userId: user?.sub,
      guestSessionId: effectiveSessionId,
    });

    if (!cart) {
      if (dto.quantity > product.stock) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}". Available: ${product.stock}`,
        );
      }

      cart = await this.cartRepository.create({
        guestSessionId: effectiveSessionId,
        userId: user?.sub ? new Types.ObjectId(user.sub) : null,
        items: [
          {
            productId: product._id,
            sku: product.sku,
            name: product.name,
            unitPriceCents,
            quantity: dto.quantity,
            selectedGrind,
            ...(variantLabel ? { variantLabel } : {}),
            ...(variantLabelAr ? { variantLabelAr } : {}),
          },
        ],
        subTotalCents: unitPriceCents * dto.quantity,
      });

      const populated = await this.cartRepository.findById(cart.id, {
        populate: [{ path: 'items.productId' }],
      });
      return this.toEntity(populated ?? cart);
    }

    // Check if same product + same grind + same variant already exists in cart
    const existingItemIndex = cart.items.findIndex((item) => {
      const itemProdId =
        item.productId && typeof item.productId === 'object' && '_id' in item.productId
          ? String((item.productId as { _id: unknown })._id)
          : String(item.productId);
      return (
        itemProdId === String(product._id) &&
        item.selectedGrind === selectedGrind &&
        (item.variantLabel || '') === (variantLabel || '')
      );
    });

    const newQuantity =
      existingItemIndex > -1
        ? cart.items[existingItemIndex].quantity + dto.quantity
        : dto.quantity;

    if (newQuantity > product.stock) {
      throw new BadRequestException(
        `Insufficient stock for "${product.name}". Requested total: ${newQuantity}, Available: ${product.stock}`,
      );
    }

    if (existingItemIndex > -1) {
      cart.items[existingItemIndex].quantity = newQuantity;
      cart.items[existingItemIndex].unitPriceCents = unitPriceCents;
      if (variantLabel) cart.items[existingItemIndex].variantLabel = variantLabel;
      if (variantLabelAr) cart.items[existingItemIndex].variantLabelAr = variantLabelAr;
    } else {
      cart.items.push({
        productId: product._id,
        sku: product.sku,
        name: product.name,
        unitPriceCents,
        quantity: dto.quantity,
        selectedGrind,
        ...(variantLabel ? { variantLabel } : {}),
        ...(variantLabelAr ? { variantLabelAr } : {}),
      });
    }

    if (user?.sub && !cart.userId) {
      cart.userId = new Types.ObjectId(user.sub);
    }

    this.recalculateCartTotals(cart);
    await cart.save();

    const populated = await this.cartRepository.findById(cart.id, {
      populate: [{ path: 'items.productId' }],
    });
    return this.toEntity(populated ?? cart);
  }

  async updateItemQuantity(
    itemId: string,
    dto: UpdateCartItemDto,
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<CartEntity> {
    const cart = await this.cartRepository.findActiveCart({
      userId: user?.sub,
      guestSessionId,
    });

    if (!cart || cart.items.length === 0) {
      throw new NotFoundException('Active shopping cart not found');
    }

    const itemIndex = cart.items.findIndex((item) => {
      const subId = item._id ? String(item._id) : '';
      const prodId =
        item.productId && typeof item.productId === 'object' && '_id' in item.productId
          ? String((item.productId as { _id: unknown })._id)
          : String(item.productId);
      return subId === itemId || prodId === itemId || item.sku === itemId.toUpperCase();
    });

    if (itemIndex === -1) {
      throw new NotFoundException(`Cart item "${itemId}" not found in cart`);
    }

    const targetItem = cart.items[itemIndex];
    const prodId =
      targetItem.productId &&
      typeof targetItem.productId === 'object' &&
      '_id' in targetItem.productId
        ? String((targetItem.productId as { _id: unknown })._id)
        : String(targetItem.productId);

    const product = await this.productRepository.findById(prodId);
    if (!product || !product.isActive) {
      throw new NotFoundException('Associated coffee product is no longer available');
    }

    if (dto.quantity > product.stock) {
      throw new BadRequestException(
        `Insufficient stock for "${product.name}". Available: ${product.stock}`,
      );
    }

    if (
      dto.selectedGrind &&
      product.availableGrinds?.length &&
      !product.availableGrinds.includes(dto.selectedGrind)
    ) {
      throw new BadRequestException(
        `Grind "${dto.selectedGrind}" is not available for "${product.name}"`,
      );
    }

    // Keep the variant's price (e.g. 1kg bag); falling back to the base price would show the
    // customer a different amount than the one charged at checkout
    const matchedVariant = targetItem.variantLabel
      ? product.variants?.find(
          (v) => v.label.toLowerCase() === targetItem.variantLabel?.trim().toLowerCase(),
        )
      : undefined;
    const discount = product.discountPercent || 0;

    cart.items[itemIndex].quantity = dto.quantity;
    cart.items[itemIndex].unitPriceCents = matchedVariant
      ? Math.max(1, Math.round(matchedVariant.priceCents * (1 - discount / 100)))
      : product.finalPriceCents;
    if (dto.selectedGrind) {
      cart.items[itemIndex].selectedGrind = dto.selectedGrind;
    }

    this.recalculateCartTotals(cart);
    await cart.save();

    const populated = await this.cartRepository.findById(cart.id, {
      populate: [{ path: 'items.productId' }],
    });
    return this.toEntity(populated ?? cart);
  }

  async removeItem(
    itemId: string,
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<CartEntity> {
    const cart = await this.cartRepository.findActiveCart({
      userId: user?.sub,
      guestSessionId,
    });

    if (!cart) {
      throw new NotFoundException('Active shopping cart not found');
    }

    const initialLen = cart.items.length;
    cart.items = cart.items.filter((item) => {
      const subId = item._id ? String(item._id) : '';
      const prodId =
        item.productId && typeof item.productId === 'object' && '_id' in item.productId
          ? String((item.productId as { _id: unknown })._id)
          : String(item.productId);
      return subId !== itemId && prodId !== itemId && item.sku !== itemId.toUpperCase();
    });

    if (cart.items.length === initialLen) {
      throw new NotFoundException(`Cart item "${itemId}" not found in cart`);
    }

    this.recalculateCartTotals(cart);
    await cart.save();

    const populated = await this.cartRepository.findById(cart.id, {
      populate: [{ path: 'items.productId' }],
    });
    return this.toEntity(populated ?? cart);
  }

  async clearCart(
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<{ message: string }> {
    const cart = await this.cartRepository.findActiveCart({
      userId: user?.sub,
      guestSessionId,
    });

    if (cart) {
      cart.items = [];
      cart.subTotalCents = 0;
      await cart.save();
    }

    return { message: 'Shopping cart cleared successfully' };
  }

  private recalculateCartTotals(cart: CartDocument): void {
    cart.subTotalCents = cart.items.reduce(
      (sum, item) => sum + item.unitPriceCents * item.quantity,
      0,
    );
  }

  private toEntity(cart: CartDocument): CartEntity {
    const raw = cart as unknown as { updatedAt?: Date };
    const items: ICartItemView[] = (cart.items || []).map((item) => {
      const isPopulated =
        item.productId &&
        typeof item.productId === 'object' &&
        '_id' in item.productId;
      const productIdStr = isPopulated
        ? String((item.productId as { _id: unknown })._id)
        : String(item.productId);

      return {
        itemId: item._id ? String(item._id) : productIdStr,
        productId: productIdStr,
        sku: item.sku,
        name: item.name,
        unitPriceCents: item.unitPriceCents,
        quantity: item.quantity,
        selectedGrind: item.selectedGrind,
        variantLabel: item.variantLabel,
        variantLabelAr: item.variantLabelAr,
        lineTotalCents: item.unitPriceCents * item.quantity,
        ...(isPopulated ? { product: item.productId } : {}),
      };
    });

    const totalItemsCount = items.reduce((acc, i) => acc + i.quantity, 0);
    const subTotalCents = items.reduce((acc, i) => acc + i.lineTotalCents, 0);

    return new CartEntity({
      id: cart.id,
      guestSessionId: cart.guestSessionId,
      userId: cart.userId ? String(cart.userId) : null,
      items,
      totalItemsCount,
      subTotalCents,
      updatedAt: raw.updatedAt,
    });
  }
}

