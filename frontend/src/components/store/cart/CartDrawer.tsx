'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Loader2, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { getDictionary, type Locale } from '@/lib/i18n';
import { SHIPPING_FEE_CENTS, formatMoney } from '@/lib/shop';
import type { ICartItem } from '@/lib/types';
import { useCart } from './CartProvider';

type PopulatedProduct = {
  slug?: string;
  nameAr?: string;
  name_ar?: string;
  imageUrls?: string[];
};

function itemName(item: ICartItem, locale: Locale): string {
  const product = item.product as PopulatedProduct | undefined;
  if (locale === 'ar') return product?.nameAr || product?.name_ar || item.name;
  return item.name;
}

function itemImage(item: ICartItem): string | null {
  return (item.product as PopulatedProduct | undefined)?.imageUrls?.[0] ?? null;
}

/** Bottom-sheet bag (vaul drawer). Opened from the nav "Cart" link and after "Add to bag". */
export function CartDrawer({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).cart;
  const {
    cart,
    open,
    setOpen,
    pending,
    error,
    coupon,
    couponError,
    setQuantity,
    removeItem,
    applyCoupon,
    clearCoupon,
  } = useCart();
  const [code, setCode] = useState('');

  const money = (cents: number) => formatMoney(cents, locale);
  const hasItems = cart.items.length > 0;
  const discount = coupon?.discountCents ?? 0;
  const total = hasItems
    ? Math.max(0, cart.subTotalCents - discount) + SHIPPING_FEE_CENTS
    : 0;

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="cart-drawer">
        <DrawerHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <DrawerTitle className="ui-caps flex items-center gap-2 text-[13px]">
                <ShoppingBag className="h-[18px] w-[18px]" aria-hidden="true" />
                {t.title} ({t.items(cart.totalItemsCount)})
              </DrawerTitle>
              <DrawerDescription>{t.description}</DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 shrink-0 rounded-full"
                aria-label={t.continueShopping}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <DrawerBody className="max-h-[60vh] overflow-y-auto">
          {error && (
            <p role="alert" className="cart-alert mb-4">
              {error}
            </p>
          )}

          {!hasItems ? (
            <div className="py-8 text-center">
              <ShoppingBag
                className="text-muted-foreground mx-auto mb-4 h-16 w-16 opacity-40"
                strokeWidth={1.2}
                aria-hidden="true"
              />
              <p className="ui-caps mb-1 text-[13px]">{t.empty}</p>
              <p className="text-muted-foreground mb-6 text-sm">{t.emptyHint}</p>
              <DrawerClose asChild>
                <Button variant="outline" className="ui-caps rounded-full text-[11px]">
                  {t.continueShopping}
                </Button>
              </DrawerClose>
            </div>
          ) : (
            <div className="space-y-4">
              <ul className="space-y-3">
                {cart.items.map((item) => {
                  const busy = pending === item.itemId;
                  const image = itemImage(item);
                  const name = itemName(item, locale);
                  return (
                    <li
                      key={item.itemId}
                      className="cart-row flex items-center gap-3 rounded-2xl border p-3 sm:gap-4 sm:p-4"
                      data-busy={busy}
                    >
                      <div className="cart-thumb grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl">
                        {image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={image} alt="" className="h-full w-full object-contain p-1" />
                        ) : (
                          <ShoppingBag className="h-5 w-5 opacity-50" aria-hidden="true" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-sm font-medium">
                          {(item.product as PopulatedProduct | undefined)?.slug ? (
                            <Link
                              href={`/${locale}/products/${(item.product as PopulatedProduct).slug}`}
                              onClick={() => setOpen(false)}
                              className="hover:underline underline-offset-2"
                            >
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                        </h3>
                        <p className="text-muted-foreground text-xs">
                          {money(item.unitPriceCents)} {t.each}
                          {(locale === 'ar' ? item.variantLabelAr : null) ||
                          item.variantLabel
                            ? ` · ${(locale === 'ar' ? item.variantLabelAr : null) || item.variantLabel}`
                            : ''}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            disabled={busy}
                            onClick={() => setQuantity(item.itemId, item.quantity - 1)}
                            aria-label={t.decrease}
                          >
                            <Minus className="h-3 w-3" aria-hidden="true" />
                          </Button>
                          <span className="w-8 text-center text-sm tabular-nums" aria-live="polite">
                            {busy ? (
                              <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                            ) : (
                              item.quantity
                            )}
                          </span>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            disabled={busy || item.quantity >= 50}
                            onClick={() => setQuantity(item.itemId, item.quantity + 1)}
                            aria-label={t.increase}
                          >
                            <Plus className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 text-end">
                        <p className="text-sm font-medium tabular-nums">
                          {money(item.lineTotalCents)}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="cart-remove h-8 rounded-full px-2.5"
                          disabled={busy}
                          onClick={() => removeItem(item.itemId)}
                          aria-label={`${t.remove}: ${name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {/* Order summary */}
              <dl className="mt-6 space-y-2 border-t pt-4 text-sm">
                <div className="flex justify-between">
                  <dt>{t.subtotal}</dt>
                  <dd className="tabular-nums">{money(cart.subTotalCents)}</dd>
                </div>
                {coupon && (
                  <div className="cart-discount flex justify-between">
                    <dt className="flex items-center gap-2">
                      {t.discount} ({coupon.code})
                      <button
                        type="button"
                        className="text-muted-foreground underline underline-offset-2 text-xs"
                        onClick={clearCoupon}
                      >
                        {t.removeCode}
                      </button>
                    </dt>
                    <dd className="tabular-nums">−{money(discount)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt>{t.shipping}</dt>
                  <dd className="tabular-nums">{money(SHIPPING_FEE_CENTS)}</dd>
                </div>
                <div className="flex justify-between border-t pt-2 font-medium">
                  <dt>{t.total}</dt>
                  <dd className="tabular-nums">{money(total)}</dd>
                </div>
              </dl>

              {/* Promo code */}
              {!coupon && (
                <form
                  className="border-t pt-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await applyCoupon(code)) setCode('');
                  }}
                >
                  <div className="flex gap-2">
                    <Input
                      value={code}
                      onChange={(e) => setCode(e.target.value.toUpperCase())}
                      placeholder={t.promoPlaceholder}
                      aria-label={t.promoPlaceholder}
                      autoComplete="off"
                      className="flex-1 rounded-full px-4"
                      aria-invalid={couponError}
                    />
                    <Button
                      type="submit"
                      variant="outline"
                      className="ui-caps rounded-full text-[11px]"
                      disabled={!code.trim() || pending === 'coupon'}
                    >
                      {pending === 'coupon' ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        t.apply
                      )}
                    </Button>
                  </div>
                  {couponError && (
                    <p role="alert" className="cart-alert mt-2 text-xs">
                      {t.couponInvalid}
                    </p>
                  )}
                </form>
              )}
            </div>
          )}
        </DrawerBody>

        <DrawerFooter className="grid-cols-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <DrawerClose asChild>
            <Button variant="outline" className="ui-caps w-full rounded-full text-[11px]">
              {t.continueShopping}
            </Button>
          </DrawerClose>
          {hasItems ? (
            <Button asChild className="cart-checkout ui-caps w-full rounded-full text-[11px]">
              <Link href={`/${locale}/checkout`} onClick={() => setOpen(false)}>
                {t.checkout} ({money(total)})
              </Link>
            </Button>
          ) : (
            <Button className="cart-checkout ui-caps w-full rounded-full text-[11px]" disabled>
              {t.checkout}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
