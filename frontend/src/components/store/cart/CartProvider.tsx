'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ICart, ICouponValidationResult } from '@/lib/types';

const EMPTY_CART: ICart = {
  id: '',
  guestSessionId: '',
  items: [],
  totalItemsCount: 0,
  subTotalCents: 0,
};

const COUPON_STORAGE_KEY = 'dibarista_coupon';

export interface IAppliedCoupon {
  code: string;
  discountCents: number;
}

interface ICartContext {
  cart: ICart;
  ready: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  /** itemId / productId currently being changed, to show a spinner on that row or button */
  pending: string | null;
  error: string | null;
  coupon: IAppliedCoupon | null;
  /** The last code the visitor tried was rejected (expired, minimum not met, unknown) */
  couponError: boolean;
  addItem: (
    productId: string,
    selectedGrind?: string,
    options?: { quantity?: number; variantLabel?: string },
  ) => Promise<boolean>;
  setQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  applyCoupon: (code: string) => Promise<boolean>;
  clearCoupon: () => void;
  /** Re-read the bag from the API (e.g. after an order emptied it) */
  refresh: () => Promise<void>;
}

const CartContext = createContext<ICartContext | null>(null);

type ApiResult<T> = { success: boolean; data?: T; error?: string };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    cache: 'no-store',
  });
  const json = (await res.json().catch(() => ({}))) as ApiResult<T>;
  if (!res.ok || !json.success || json.data === undefined) {
    throw new Error(json.error || `Request failed (${res.status})`);
  }
  return json.data;
}

function saveCoupon(coupon: IAppliedCoupon | null) {
  try {
    if (coupon) sessionStorage.setItem(COUPON_STORAGE_KEY, coupon.code);
    else sessionStorage.removeItem(COUPON_STORAGE_KEY);
  } catch {
    // Storage blocked: the code just won't carry over to checkout
  }
}

/**
 * Bag state for the whole storefront. The cart itself lives in the API (keyed by the
 * httpOnly guest cookie set by /api/cart/*); this provider only mirrors it for the UI.
 */
export function CartProvider({
  children,
  errorMessage,
}: {
  children: React.ReactNode;
  errorMessage: string;
}) {
  const [cart, setCart] = useState<ICart>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<IAppliedCoupon | null>(null);
  const [couponError, setCouponError] = useState(false);
  const couponRef = useRef<IAppliedCoupon | null>(null);
  useEffect(() => {
    couponRef.current = coupon;
  }, [coupon]);

  const validateCoupon = useCallback(
    async (code: string, subTotalCents: number) => {
      const result = await api<ICouponValidationResult>(
        '/api/coupons/validate',
        { method: 'POST', body: JSON.stringify({ code, subTotalCents }) },
      );
      return { code: result.code, discountCents: result.discountCents };
    },
    [],
  );

  useEffect(() => {
    let alive = true;
    api<ICart>('/api/cart')
      .then(async (data) => {
        if (!alive) return;
        setCart(data);
        // Bring back a code applied earlier in this tab (re-checked against today's bag)
        let saved: string | null = null;
        try {
          saved = sessionStorage.getItem(COUPON_STORAGE_KEY);
        } catch {
          saved = null;
        }
        if (saved && data.subTotalCents > 0) {
          const restored = await validateCoupon(saved, data.subTotalCents).catch(
            () => null,
          );
          if (alive) setCoupon(restored);
          if (!restored) saveCoupon(null);
        }
      })
      .catch(() => undefined)
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [validateCoupon]);

  const run = useCallback(
    async (key: string, request: () => Promise<ICart>) => {
      setPending(key);
      setError(null);
      try {
        const next = await request();
        setCart(next);
        // A coupon's discount depends on the subtotal, so re-check it after every bag change
        const current = couponRef.current;
        if (current) {
          if (next.subTotalCents < 1) {
            setCoupon(null);
            saveCoupon(null);
          } else {
            validateCoupon(current.code, next.subTotalCents)
              .then(setCoupon)
              .catch(() => {
                setCoupon(null);
                saveCoupon(null);
                setCouponError(true);
              });
          }
        }
        return true;
      } catch {
        setError(errorMessage);
        return false;
      } finally {
        setPending(null);
      }
    },
    [errorMessage, validateCoupon],
  );

  const addItem = useCallback(
    async (
      productId: string,
      selectedGrind?: string,
      options?: { quantity?: number; variantLabel?: string },
    ) => {
      const ok = await run(productId, () =>
        api<ICart>('/api/cart/items', {
          method: 'POST',
          body: JSON.stringify({
            productId,
            quantity: options?.quantity ?? 1,
            selectedGrind,
            variantLabel: options?.variantLabel,
          }),
        }),
      );
      setOpen(true);
      return ok;
    },
    [run],
  );

  const removeItem = useCallback(
    async (itemId: string) => {
      await run(itemId, () =>
        api<ICart>(`/api/cart/items/${encodeURIComponent(itemId)}`, {
          method: 'DELETE',
        }),
      );
    },
    [run],
  );

  const setQuantity = useCallback(
    async (itemId: string, quantity: number) => {
      if (quantity < 1) return removeItem(itemId);
      await run(itemId, () =>
        api<ICart>(`/api/cart/items/${encodeURIComponent(itemId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity }),
        }),
      );
    },
    [run, removeItem],
  );

  const applyCoupon = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed || cart.subTotalCents < 1) return false;
      setPending('coupon');
      setCouponError(false);
      try {
        const next = await validateCoupon(trimmed, cart.subTotalCents);
        setCoupon(next);
        saveCoupon(next);
        return true;
      } catch {
        setCouponError(true);
        return false;
      } finally {
        setPending(null);
      }
    },
    [cart.subTotalCents, validateCoupon],
  );

  const refresh = useCallback(async () => {
    try {
      const next = await api<ICart>('/api/cart');
      setCart(next);
      if (next.subTotalCents < 1) {
        setCoupon(null);
        saveCoupon(null);
      }
    } catch {
      // keep what we have
    }
  }, []);

  const clearCoupon = useCallback(() => {
    setCoupon(null);
    setCouponError(false);
    saveCoupon(null);
  }, []);

  const value = useMemo(
    () => ({
      cart,
      ready,
      open,
      setOpen,
      pending,
      error,
      coupon,
      couponError,
      addItem,
      setQuantity,
      removeItem,
      applyCoupon,
      clearCoupon,
      refresh,
    }),
    [
      cart,
      ready,
      open,
      pending,
      error,
      coupon,
      couponError,
      addItem,
      setQuantity,
      removeItem,
      applyCoupon,
      clearCoupon,
      refresh,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): ICartContext {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
