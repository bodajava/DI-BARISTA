'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { ITrackedOrder } from '@/lib/types';
import { useCart } from '../cart/CartProvider';
import { LAST_ORDER_KEY } from './CheckoutForm';

type Stored = { orderNumber: string; email: string; method: string };
type View = 'checking' | 'placed' | 'paid' | 'failed' | 'pendingLong' | 'unknown';

const ORDER = /^[A-Za-z0-9-]{4,40}$/;
const POLL_EVERY_MS = 2500;
const POLL_TIMES = 12;

function readStored(): Stored | null {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    return raw ? (JSON.parse(raw) as Stored) : null;
  } catch {
    return null;
  }
}

async function fetchOrder(orderNumber: string, email: string): Promise<ITrackedOrder | null> {
  const res = await fetch('/api/orders/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderNumber, contact: email }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { data?: ITrackedOrder };
  return json.data ?? null;
}

/**
 * Shown after checkout. Cash orders are confirmed right away. For card / wallet payments
 * Paymob's redirect is NOT trusted: the page polls the order until the verified webhook has
 * marked it paid (or failed).
 */
export function CheckoutComplete({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).complete;
  const searchParams = useSearchParams();
  const { refresh } = useCart();
  const [view, setView] = useState<View>('checking');
  const [order, setOrder] = useState<{ number: string; email?: string } | null>(null);

  useEffect(() => {
    let alive = true;
    const timers: number[] = [];
    const fromUrl = searchParams.get('order') || '';
    const stored = readStored();
    const orderNumber = ORDER.test(fromUrl) ? fromUrl : stored?.orderNumber || '';
    const email = stored && stored.orderNumber === orderNumber ? stored.email : undefined;
    const online = stored?.method ? stored.method !== 'CASH_ON_DELIVERY' : searchParams.has('paid');

    const finish = (next: View) => {
      if (!alive) return;
      setView(next);
      if (next === 'placed' || next === 'paid') void refresh();
    };

    const start = window.setTimeout(async () => {
      if (!alive) return;
      setOrder(orderNumber ? { number: orderNumber, email } : null);
      if (!orderNumber) return finish('unknown');
      if (!online) return finish('placed');
      if (!email) return finish(searchParams.get('paid') === '0' ? 'failed' : 'unknown');

      for (let i = 0; i < POLL_TIMES && alive; i++) {
        const data = await fetchOrder(orderNumber, email).catch(() => null);
        const payment = String(data?.paymentStatus || '').toUpperCase();
        if (payment === 'SUCCESS' || payment === 'PAID') return finish('paid');
        if (payment === 'FAILED' || payment === 'DECLINED') return finish('failed');
        // Paymob says it failed and the webhook hasn't said otherwise after a couple of checks
        if (searchParams.get('paid') === '0' && i >= 1) return finish('failed');
        await new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, POLL_EVERY_MS)));
      }
      finish('pendingLong');
    }, 0);
    timers.push(start);

    return () => {
      alive = false;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [searchParams, refresh]);

  const icon =
    view === 'checking' ? (
      <Loader2 className="complete-icon track-spin" aria-hidden="true" />
    ) : view === 'failed' ? (
      <XCircle className="complete-icon" data-tone="bad" aria-hidden="true" />
    ) : view === 'pendingLong' || view === 'unknown' ? (
      <Clock className="complete-icon" aria-hidden="true" />
    ) : (
      <CheckCircle2 className="complete-icon" data-tone="good" aria-hidden="true" />
    );

  const title = {
    checking: t.checking,
    placed: t.placed,
    paid: t.paid,
    failed: t.failed,
    pendingLong: t.pendingLong,
    unknown: t.unknown,
  }[view];

  const body =
    view === 'checking'
      ? t.checkingBody
      : view === 'failed'
        ? t.failedBody
        : view === 'pendingLong'
          ? t.pendingLongBody
          : view === 'unknown'
            ? t.unknownBody
            : order?.email
              ? t.emailNote(order.email)
              : '';

  const trackHref = order ? `/${locale}/track-order?order=${encodeURIComponent(order.number)}` : `/${locale}/track-order`;

  return (
    <section className="track-card complete" aria-live="polite">
      {icon}
      {(view === 'placed' || view === 'paid') && <p className="complete-thanks ui-caps">{t.thanks}</p>}
      <h2 className="complete-title">{title}</h2>
      {body && <p className="complete-body">{body}</p>}
      {order && (
        <p className="complete-order">
          <span className="ui-caps">{t.orderNumber}</span>
          <strong dir="ltr">{order.number}</strong>
        </p>
      )}
      <div className="complete-actions">
        {view === 'failed' ? (
          <Link href={`/${locale}/checkout`} className="track-submit ui-caps">
            {t.tryAgain}
          </Link>
        ) : (
          <Link href={trackHref} className="track-submit ui-caps">
            {t.track}
          </Link>
        )}
        <Link href={`/${locale}#shop`} className="track-another ui-caps">
          {t.keepShopping}
        </Link>
      </div>
    </section>
  );
}
