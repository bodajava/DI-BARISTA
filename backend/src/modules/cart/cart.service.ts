import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cart, CartItem, Prisma, Product, ProductVariant } from '@prisma/client';
import { randomUUID } from 'crypto';
import { GrindType } from '../../common/enums';
import { IJwtPayload } from '../../common/interfaces';
import { PrismaService } from '../../database/prisma.service';
import { ProductService } from '../product/product.service';
import { AddToCartDto, UpdateCartItemDto } from './dto';
import { CartEntity, ICartItemView } from './entities/cart.entity';

const CART_INCLUDE = {
  items: {
    orderBy: { createdAt: 'asc' },
    include: { product: { include: { brand: true, category: true, variants: true } } },
  },
} satisfies Prisma.CartInclude;

type CartWithItems = Prisma.CartGetPayload<{ include: typeof CART_INCLUDE }>;
type ProductWithVariants = Product & { variants: ProductVariant[] };

@Injectable()
export class CartService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productService: ProductService,
  ) {}

  private sessionIdFor(user?: IJwtPayload, guestSessionId?: string): string {
    return guestSessionId || (user ? `user_${user.sub}` : `guest_${randomUUID()}`);
  }

  /** The signed-in customer's cart first, else the guest cart of this browser */
  private async findCart(userId?: string, guestSessionId?: string): Promise<CartWithItems | null> {
    if (userId) {
      const userCart = await this.prisma.cart.findFirst({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        include: CART_INCLUDE,
      });
      if (userCart) return userCart;
    }
    if (guestSessionId) {
      return this.prisma.cart.findUnique({ where: { guestSessionId: guestSessionId.trim() }, include: CART_INCLUDE });
    }
    return null;
  }

  async getActiveCart(user?: IJwtPayload, guestSessionId?: string): Promise<CartEntity> {
    const sessionId = this.sessionIdFor(user, guestSessionId);
    const cart = await this.findCart(user?.sub, sessionId);
    if (!cart) {
      return new CartEntity({
        id: '',
        guestSessionId: sessionId,
        userId: user?.sub ?? null,
        items: [],
        totalItemsCount: 0,
        subTotalCents: 0,
      });
    }
    return this.toEntity(cart);
  }

  private resolveVariant(product: ProductWithVariants, variantId?: string, label?: string): ProductVariant | undefined {
    const active = product.variants.filter((v) => v.isActive);
    if (variantId) return active.find((v) => v.id === variantId);
    if (label?.trim()) return active.find((v) => v.label.toLowerCase() === label.trim().toLowerCase());
    return undefined;
  }

  private priceFor(product: Product, variant?: ProductVariant): number {
    return variant ? ProductService.variantPrice(product, variant) : product.finalPriceCents;
  }

  private availableStock(product: Product, variant?: ProductVariant): number {
    return variant && variant.stock !== null ? variant.stock : product.stock;
  }

  async addItem(dto: AddToCartDto, user?: IJwtPayload, guestSessionId?: string): Promise<CartEntity> {
    if (!dto.productId && !dto.sku) {
      throw new BadRequestException('Either productId or sku must be provided to add an item to cart');
    }
    const product = await this.prisma.product.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        ...(dto.productId ? { id: dto.productId } : { sku: dto.sku!.toUpperCase().trim() }),
      },
      include: { variants: true },
    });
    if (!product) throw new NotFoundException('This product is not available');

    const selectedGrind = dto.selectedGrind ?? GrindType.WHOLE_BEAN;
    if (product.availableGrinds.length && !product.availableGrinds.includes(selectedGrind)) {
      throw new BadRequestException(
        `Grind "${selectedGrind}" is not available for "${product.name}". Available grinds: ${product.availableGrinds.join(', ')}`,
      );
    }
    const variant = this.resolveVariant(product, dto.variantId, dto.variantLabel);
    if ((dto.variantId || dto.variantLabel) && !variant) {
      throw new BadRequestException('This version is no longer available');
    }
    const unitPriceCents = this.priceFor(product, variant);
    const sessionId = this.sessionIdFor(user, guestSessionId);

    let cart = await this.findCart(user?.sub, sessionId);
    if (!cart) {
      cart = await this.prisma.cart.create({
        data: { guestSessionId: sessionId, userId: user?.sub ?? null },
        include: CART_INCLUDE,
      });
    } else if (user?.sub && !cart.userId) {
      await this.prisma.cart.update({ where: { id: cart.id }, data: { userId: user.sub } });
    }

    const existing = cart.items.find(
      (i) =>
        i.productId === product.id &&
        i.selectedGrind === selectedGrind &&
        (i.variantId ?? '') === (variant?.id ?? '') &&
        (variant || (i.variantLabel ?? '') === ''),
    );
    const newQuantity = (existing?.quantity ?? 0) + dto.quantity;
    const stock = this.availableStock(product, variant);
    if (newQuantity > stock) {
      throw new BadRequestException(`Only ${stock} of "${product.name}" left in stock`);
    }

    if (existing) {
      await this.prisma.cartItem.update({
        where: { id: existing.id },
        data: { quantity: newQuantity, unitPriceCents },
      });
    } else {
      await this.prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: product.id,
          variantId: variant?.id ?? null,
          sku: variant?.sku || product.sku,
          name: product.name,
          unitPriceCents,
          quantity: dto.quantity,
          selectedGrind,
          variantLabel: variant?.label ?? null,
          variantLabelAr: variant?.labelAr ?? null,
        },
      });
    }
    return this.reload(cart.id);
  }

  private findItem(cart: CartWithItems, itemId: string): CartWithItems['items'][number] | undefined {
    return cart.items.find(
      (i) => i.id === itemId || i.productId === itemId || i.sku === itemId.toUpperCase(),
    );
  }

  async updateItemQuantity(
    itemId: string,
    dto: UpdateCartItemDto,
    user?: IJwtPayload,
    guestSessionId?: string,
  ): Promise<CartEntity> {
    const cart = await this.findCart(user?.sub, guestSessionId);
    if (!cart || cart.items.length === 0) throw new NotFoundException('Your bag is empty');
    const item = this.findItem(cart, itemId);
    if (!item) throw new NotFoundException('This piece is no longer in your bag');

    const product = item.product;
    if (!product || product.deletedAt || !product.isActive) {
      throw new NotFoundException('This product is no longer available');
    }
    const variant = item.variantId
      ? product.variants.find((v) => v.id === item.variantId)
      : this.resolveVariant(product, undefined, item.variantLabel ?? undefined);
    const stock = this.availableStock(product, variant);
    if (dto.quantity > stock) {
      throw new BadRequestException(`Only ${stock} of "${product.name}" left in stock`);
    }
    if (dto.selectedGrind && product.availableGrinds.length && !product.availableGrinds.includes(dto.selectedGrind)) {
      throw new BadRequestException(`Grind "${dto.selectedGrind}" is not available for "${product.name}"`);
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: {
        quantity: dto.quantity,
        unitPriceCents: this.priceFor(product, variant),
        ...(dto.selectedGrind ? { selectedGrind: dto.selectedGrind } : {}),
      },
    });
    return this.reload(cart.id);
  }

  async removeItem(itemId: string, user?: IJwtPayload, guestSessionId?: string): Promise<CartEntity> {
    const cart = await this.findCart(user?.sub, guestSessionId);
    if (!cart) throw new NotFoundException('Your bag is empty');
    const item = this.findItem(cart, itemId);
    if (!item) throw new NotFoundException('This piece is no longer in your bag');
    await this.prisma.cartItem.delete({ where: { id: item.id } });
    return this.reload(cart.id);
  }

  async clearCart(user?: IJwtPayload, guestSessionId?: string): Promise<{ message: string }> {
    const cart = await this.findCart(user?.sub, guestSessionId);
    if (cart) await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { message: 'Shopping cart cleared successfully' };
  }

  private async reload(cartId: string): Promise<CartEntity> {
    const cart = await this.prisma.cart.update({
      where: { id: cartId },
      data: { updatedAt: new Date() },
      include: CART_INCLUDE,
    });
    return this.toEntity(cart);
  }

  private toEntity(cart: Cart & { items: CartWithItems['items'] }): CartEntity {
    const items: ICartItemView[] = cart.items.map((item: CartItem & { product?: CartWithItems['items'][number]['product'] }) => ({
      itemId: item.id,
      productId: item.productId,
      variantId: item.variantId,
      sku: item.sku,
      name: item.name,
      unitPriceCents: item.unitPriceCents,
      quantity: item.quantity,
      selectedGrind: item.selectedGrind as GrindType,
      variantLabel: item.variantLabel ?? undefined,
      variantLabelAr: item.variantLabelAr ?? undefined,
      lineTotalCents: item.unitPriceCents * item.quantity,
      ...(item.product ? { product: this.productService.toEntity(item.product) } : {}),
    }));
    return new CartEntity({
      id: cart.id,
      guestSessionId: cart.guestSessionId,
      userId: cart.userId,
      items,
      totalItemsCount: items.reduce((acc, i) => acc + i.quantity, 0),
      subTotalCents: items.reduce((acc, i) => acc + i.lineTotalCents, 0),
      updatedAt: cart.updatedAt,
    });
  }
}
