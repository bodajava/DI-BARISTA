'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Check, Loader2, PackageSearch } from 'lucide-react';
import { getDictionary, LOCALE_META, type Locale } from '@/lib/i18n';
import { formatMoney } from '@/lib/shop';
import {
  normalizeOrderStage,
  type ITrackedOrder,
  type TrackStage,
} from '@/lib/types';

const STAGES: TrackStage[] = [
  'PENDING',
  'ROASTING',
  'PACKING',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

type FormState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'found'; order: ITrackedOrder };

function OrderResult({
  order,
  locale,
  onReset,
}: {
  order: ITrackedOrder;
  locale: Locale;
  onReset: () => void;
}) {
  const t = getDictionary(locale).track;
  const money = (cents: number) => formatMoney(cents, locale);
  const stage = normalizeOrderStage(String(order.status));
  const closed = stage === 'CANCELLED' || stage === 'REFUNDED';
  const currentIndex = closed ? -1 : STAGES.indexOf(stage);
  const placed = order.createdAt
    ? new Intl.DateTimeFormat(LOCALE_META[locale].intl, {
        dateStyle: 'long',
      }).format(new Date(order.createdAt))
    : null;
  const address = [order.shippingAddress?.street, order.shippingAddress?.building, order.shippingAddress?.city]
    .filter(Boolean)
    .join(locale === 'ar' ? '، ' : ', ');

  return (
    <section className="track-card track-result" aria-live="polite">
      <header className="track-result-head">
        <div>
          <p className="track-eyebrow ui-caps">{t.orderLabel}</p>
          <p className="track-number" dir="ltr">
            {order.orderNumber}
          </p>
        </div>
        {placed && (
          <p className="track-date">
            {t.placedOn} {placed}
          </p>
        )}
      </header>

      {closed ? (
        <p className="track-closed">
          {stage === 'CANCELLED' ? t.cancelled : t.refunded}
        </p>
      ) : (
        <ol className="track-steps">
          {STAGES.map((s, i) => {
            const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo';
            return (
              <li
                key={s}
                className="track-step"
                data-state={state}
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span className="track-dot" aria-hidden="true">
                  {state === 'done' ? <Check /> : null}
                </span>
                <span className="track-step-label">{t.stages[s]}</span>
              </li>
            );
          })}
        </ol>
      )}

      <div className="track-grid">
        <div>
          <h2 className="track-h ui-caps">{t.items}</h2>
          <ul className="track-items">
            {order.items.map((item, i) => (
              <li key={`${item.sku}-${i}`}>
                <span className="track-item-name">{item.name}</span>
                <span className="track-item-qty">
                  {t.qty} {item.quantity}
                </span>
                <span className="track-item-total">{money(item.lineTotalCents)}</span>
              </li>
            ))}
          </ul>
          <dl className="track-totals">
            <div>
              <dt>{t.subtotal}</dt>
              <dd>{money(order.subTotalCents)}</dd>
            </div>
            {order.discountCents > 0 && (
              <div>
                <dt>
                  {t.discount}
                  {order.couponCode ? ` (${order.couponCode})` : ''}
                </dt>
                <dd>−{money(order.discountCents)}</dd>
              </div>
            )}
            <div>
              <dt>{t.shipping}</dt>
              <dd>{money(order.shippingFeeCents)}</dd>
            </div>
            <div className="track-total">
              <dt>{t.total}</dt>
              <dd>{money(order.totalCents)}</dd>
            </div>
          </dl>
        </div>

        <div className="track-meta">
          {address && (
            <div>
              <h2 className="track-h ui-caps">{t.deliverTo}</h2>
              <p>{address}</p>
            </div>
          )}
          <div>
            <h2 className="track-h ui-caps">{t.payment}</h2>
            <p>
              {t.paymentMethods[String(order.paymentMethod)] ?? order.paymentMethod}
              {' · '}
              {t.paymentStatus[String(order.paymentStatus)] ?? order.paymentStatus}
            </p>
          </div>
        </div>
      </div>

      <button type="button" className="track-another ui-caps" onClick={onReset}>
        {t.another}
      </button>
    </section>
  );
}

/** Order number + email/phone form; shows a status timeline when the order is found */
export function TrackOrderForm({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).track;
  const searchParams = useSearchParams();
  const [orderNumber, setOrderNumber] = useState(
    () => (searchParams.get('order') || '').toUpperCase().slice(0, 40),
  );
  const [contact, setContact] = useState('');
  const [state, setState] = useState<FormState>({ kind: 'idle' });

  if (state.kind === 'found') {
    return (
      <OrderResult
        order={state.order}
        locale={locale}
        onReset={() => setState({ kind: 'idle' })}
      />
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState({ kind: 'loading' });
    try {
      const res = await fetch('/api/orders/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderNumber, contact }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: ITrackedOrder;
      };
      if (res.ok && json.data) {
        setState({ kind: 'found', order: json.data });
      } else if (res.status === 429) {
        setState({ kind: 'error', message: t.tooMany });
      } else if (res.status === 404 || res.status === 400) {
        setState({ kind: 'error', message: t.notFound });
      } else {
        setState({ kind: 'error', message: t.error });
      }
    } catch {
      setState({ kind: 'error', message: t.error });
    }
  };

  const loading = state.kind === 'loading';

  return (
    <form className="track-card track-form" onSubmit={submit} noValidate>
      <PackageSearch className="track-icon" aria-hidden="true" strokeWidth={1.2} />
      <label className="track-field">
        <span className="ui-caps">{t.orderNumber}</span>
        <input
          value={orderNumber}
          onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
          placeholder={t.orderPlaceholder}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          dir="ltr"
          required
          maxLength={40}
        />
      </label>
      <label className="track-field">
        <span className="ui-caps">{t.contact}</span>
        <input
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          placeholder={t.contactPlaceholder}
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          required
          maxLength={120}
        />
      </label>

      {state.kind === 'error' && (
        <p role="alert" className="cart-alert">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        className="track-submit ui-caps"
        disabled={loading || orderNumber.trim().length < 6 || contact.trim().length < 5}
      >
        {loading ? (
          <>
            <Loader2 className="track-spin" aria-hidden="true" /> {t.loading}
          </>
        ) : (
          t.submit
        )}
      </button>
    </form>
  );
}
