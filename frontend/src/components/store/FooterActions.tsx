'use client';

import { useCart } from './cart/CartProvider';
import { openSearch } from './search/SearchDialog';

/** Footer links that open the search and bag sheets */
export function FooterActions({ searchLabel, bagLabel }: { searchLabel: string; bagLabel: string }) {
  const { setOpen } = useCart();
  return (
    <>
      <li>
        <button type="button" onClick={openSearch}>
          {searchLabel}
        </button>
      </li>
      <li>
        <button type="button" onClick={() => setOpen(true)}>
          {bagLabel}
        </button>
      </li>
    </>
  );
}
