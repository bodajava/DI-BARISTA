'use client';

import Link from 'next/link';
import { ShoppingBag } from 'lucide-react';
import type { Locale } from '@/lib/i18n';
import { useCart } from '../cart/CartProvider';

/** Focused checkout header: brand + bag, nothing to lead the shopper away */
export function CheckoutHeader({ locale, bagLabel }: { locale: Locale; bagLabel: string }) {
  const { cart, setOpen } = useCart();
  return (
    <header className="co-header">
      <div className="co-header-inner">
        <Link href={`/${locale}`} className="co-brand" aria-label="DI BARISTA">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/media/brand-mark.png" alt="" width={30} height={30} />
          <span>DI BARISTA</span>
        </Link>
        <button type="button" className="co-bag" onClick={() => setOpen(true)} aria-label={bagLabel}>
          <ShoppingBag aria-hidden="true" />
          {cart.totalItemsCount > 0 && <span>{cart.totalItemsCount}</span>}
        </button>
      </div>
    </header>
  );
}
