'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Loader2, Lock, ShoppingBag, X } from 'lucide-react';
import { getDictionary, type Locale } from '@/lib/i18n';
import { GOVERNORATES, normalizeEgyptPhone, type PaymentMethodKey } from '@/lib/egypt';
import { SHIPPING_FEE_CENTS, formatMoney } from '@/lib/shop';
import type { ICartItem } from '@/lib/types';
import { useCart } from '../cart/CartProvider';

export const LAST_ORDER_KEY = 'dibarista_last_order';
const DETAILS_KEY = 'dibarista_checkout_details';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Fields = {
  email: string;
  firstName: string;
  lastName: string;
  street: string;
  building: string;
  floor: string;
  apartment: string;
  city: string;
  governorate: string;
  postal: string;
  phone: string;
  notes: string;
};

const EMPTY: Fields = {
  email: '',
  firstName: '',
  lastName: '',
  street: '',
  building: '',
  floor: '',
  apartment: '',
  city: '',
  governorate: 'Cairo',
  postal: '',
  phone: '',
  notes: '',
};

type FieldError = Partial<Record<keyof Fields, string>>;
type PopulatedProduct = { nameAr?: string; name_ar?: string; imageUrls?: string[] };

function itemName(item: ICartItem, locale: Locale) {
  const p = item.product as PopulatedProduct | undefined;
  return locale === 'ar' ? p?.nameAr || p?.name_ar || item.name : item.name;
}

/** Small brand-coloured marks (no third-party logo files) */
function PayMarks() {
  return (
    <span className="co-marks" aria-hidden="true">
      <span className="co-mark co-mark-visa">VISA</span>
      <span className="co-mark co-mark-mc">
        <i />
        <i />
      </span>
      <span className="co-mark co-mark-meeza">meeza</span>
      <span className="co-mark co-mark-wallet">Wallet</span>
    </span>
  );
}

/** Items, discount code and totals: used in the side column and the mobile drawer */
function OrderSummary({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.checkout;
  const { cart, coupon, couponError, pending, applyCoupon, clearCoupon } = useCart();
  const [code, setCode] = useState('');
  const money = (cents: number) => formatMoney(cents, locale);
  const discount = coupon?.discountCents ?? 0;
  const total = Math.max(0, cart.subTotalCents - discount) + SHIPPING_FEE_CENTS;
  const inputId = useId();

  return (
    <div className="co-summary">
      <ul className="co-items">
        {cart.items.map((item) => {
          const image = (item.product as PopulatedProduct | undefined)?.imageUrls?.[0];
          return (
            <li key={item.itemId}>
              <span className="co-thumb">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {image && <img src={image} alt="" />}
                <span className="co-qty">{item.quantity}</span>
              </span>
              <span className="co-item-name">
                {itemName(item, locale)}
                {item.variantLabel && <small>{item.variantLabel}</small>}
              </span>
              <span className="co-item-price">{money(item.lineTotalCents)}</span>
            </li>
          );
        })}
      </ul>

      {coupon ? (
        <div className="co-coupon-applied">
          <span>
            {dict.cart.discount}: <strong dir="ltr">{coupon.code}</strong>
          </span>
          <button type="button" onClick={clearCoupon} aria-label={t.removeCoupon}>
            <X aria-hidden="true" />
          </button>
        </div>
      ) : (
        <form
          className="co-coupon"
          onSubmit={async (e) => {
            e.preventDefault();
            if (code.trim() && (await applyCoupon(code.trim()))) setCode('');
          }}
        >
          <label className="sr-only" htmlFor={inputId}>
            {t.discountPlaceholder}
          </label>
          <input
            id={inputId}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t.discountPlaceholder}
            autoComplete="off"
            dir="ltr"
            maxLength={32}
          />
          <button type="submit" disabled={!code.trim() || pending === 'coupon'}>
            {pending === 'coupon' ? <Loader2 className="track-spin" aria-hidden="true" /> : t.apply}
          </button>
        </form>
      )}
      {couponError && !coupon && <p className="co-error">{t.couponInvalid}</p>}

      <dl className="co-totals">
        <div>
          <dt>{dict.cart.subtotal}</dt>
          <dd>{money(cart.subTotalCents)}</dd>
        </div>
        {coupon && (
          <div className="cart-discount">
            <dt>{dict.cart.discount}</dt>
            <dd>−{money(discount)}</dd>
          </div>
        )}
        <div>
          <dt>{dict.cart.shipping}</dt>
          <dd>{money(SHIPPING_FEE_CENTS)}</dd>
        </div>
        <div className="co-total">
          <dt>{dict.cart.total}</dt>
          <dd>
            <small>EGP</small> {money(total)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function CheckoutForm({ locale, methods }: { locale: Locale; methods: PaymentMethodKey[] }) {
  const dict = getDictionary(locale);
  const t = dict.checkout;
  const router = useRouter();
  const { cart, ready, coupon, refresh } = useCart();
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [method, setMethod] = useState<PaymentMethodKey>(methods[0]);
  const [newsletter, setNewsletter] = useState(true);
  const [saveInfo, setSaveInfo] = useState(true);
  const [errors, setErrors] = useState<FieldError>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'placing' | 'redirecting'>('idle');

  // Prefill from the last checkout on this device (localStorage only exists after hydration)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(DETAILS_KEY);
        if (raw) setFields((f) => ({ ...f, ...(JSON.parse(raw) as Partial<Fields>), notes: '' }));
      } catch {
        // storage blocked or old format: start empty
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const money = (cents: number) => formatMoney(cents, locale);
  const discount = coupon?.discountCents ?? 0;
  const total = Math.max(0, cart.subTotalCents - discount) + SHIPPING_FEE_CENTS;
  const busy = status !== 'idle';
  const online = method !== 'CASH_ON_DELIVERY';

  const set =
    (key: keyof Fields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setFields((f) => ({ ...f, [key]: e.target.value }));
      if (errors[key]) setErrors((er) => ({ ...er, [key]: undefined }));
    };

  const validate = (): FieldError => {
    const er: FieldError = {};
    if (!EMAIL.test(fields.email.trim())) er.email = t.errors.email;
    if (fields.firstName.trim().length < 2) er.firstName = t.errors.firstName;
    if (fields.lastName.trim().length < 1) er.lastName = t.errors.lastName;
    if (!fields.street.trim()) er.street = t.errors.street;
    if (!fields.building.trim()) er.building = t.errors.building;
    if (!fields.city.trim()) er.city = t.errors.city;
    if (!fields.governorate) er.governorate = t.errors.governorate;
    if (!normalizeEgyptPhone(fields.phone)) er.phone = t.errors.phone;
    return er;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const er = validate();
    setErrors(er);
    const firstInvalid = Object.keys(er)[0];
    if (firstInvalid) {
      document.getElementById(`co-${firstInvalid}`)?.focus();
      return;
    }

    setStatus('placing');
    const email = fields.email.trim().toLowerCase();
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${fields.firstName.trim()} ${fields.lastName.trim()}`,
          email,
          phone: fields.phone,
          governorate: fields.governorate,
          street: [fields.street.trim(), fields.city.trim(), fields.postal.trim()].filter(Boolean).join(', '),
          building: fields.building,
          floor: fields.floor,
          apartment: fields.apartment,
          notes: fields.notes,
          paymentMethod: method,
          couponCode: coupon?.code,
          locale,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { orderNumber: string; checkoutUrl?: string };
        error?: string;
        code?: string;
      };

      if (!res.ok || !json.data) {
        setStatus('idle');
        if (res.status === 429) setFormError(t.errors.tooMany);
        else if (/stock|available|quantity/i.test(json.error || '')) setFormError(t.errors.stock);
        else if (json.code === 'payment' || res.status === 502 || /paymob|payment checkout/i.test(json.error || ''))
          setFormError(t.errors.payment);
        else setFormError(t.errors.generic);
        return;
      }

      try {
        if (saveInfo) {
          const { notes: _notes, ...keep } = fields;
          void _notes;
          localStorage.setItem(DETAILS_KEY, JSON.stringify(keep));
        } else {
          localStorage.removeItem(DETAILS_KEY);
        }
        sessionStorage.setItem(
          LAST_ORDER_KEY,
          JSON.stringify({ orderNumber: json.data.orderNumber, email, method }),
        );
      } catch {
        // storage blocked: the confirmation page falls back to the order number in the URL
      }

      if (newsletter) {
        void fetch('/api/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, locale }),
          keepalive: true,
        }).catch(() => undefined);
      }

      if (json.data.checkoutUrl) {
        setStatus('redirecting');
        window.location.assign(json.data.checkoutUrl);
        return;
      }

      await refresh();
      router.push(`/${locale}/checkout/complete?order=${encodeURIComponent(json.data.orderNumber)}`);
    } catch {
      setStatus('idle');
      setFormError(t.errors.generic);
    }
  };

  if (ready && cart.items.length === 0 && status === 'idle') {
    return (
      <div className="checkout-empty">
        <ShoppingBag aria-hidden="true" strokeWidth={1.2} />
        <h2 className="ui-caps">{t.emptyTitle}</h2>
        <p>{t.emptyBody}</p>
        <Link href={`/${locale}#shop`} className="track-submit ui-caps">
          {t.backToShop}
        </Link>
      </div>
    );
  }

  const input = (
    key: keyof Fields,
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <div className="co-float" data-invalid={Boolean(errors[key])}>
      <input
        id={`co-${key}`}
        value={fields[key]}
        onChange={set(key)}
        placeholder=" "
        aria-invalid={Boolean(errors[key])}
        aria-describedby={errors[key] ? `co-${key}-error` : undefined}
        {...props}
      />
      <label htmlFor={`co-${key}`}>{label}</label>
      {errors[key] && (
        <small id={`co-${key}-error`} className="co-error">
          {errors[key]}
        </small>
      )}
    </div>
  );

  return (
    <div className="co-layout">
      <details className="co-mobile-summary">
        <summary>
          <span>
            <ShoppingBag aria-hidden="true" />
            <span className="co-show">{t.showSummary}</span>
            <span className="co-hide">{t.hideSummary}</span>
            <ChevronDown aria-hidden="true" className="co-chevron" />
          </span>
          <strong>{money(total)}</strong>
        </summary>
        <OrderSummary locale={locale} />
      </details>

      <form className="co-main" onSubmit={submit} noValidate>
        <fieldset disabled={busy}>
          <section className="co-block">
            <h2 className="co-title">{t.contactTitle}</h2>
            {input('email', t.email, { type: 'email', inputMode: 'email', autoComplete: 'email', dir: 'ltr', maxLength: 254 })}
            <label className="co-check">
              <input type="checkbox" checked={newsletter} onChange={(e) => setNewsletter(e.target.checked)} />
              <span>{t.newsletterOptIn}</span>
            </label>
          </section>

          <section className="co-block">
            <h2 className="co-title">{t.deliveryTitle}</h2>
            <div className="co-float co-select">
              <select id="co-country" value="EG" disabled aria-readonly="true">
                <option value="EG">{t.egypt}</option>
              </select>
              <label htmlFor="co-country">{t.country}</label>
            </div>
            <div className="co-grid-2">
              {input('firstName', t.firstName, { autoComplete: 'given-name', maxLength: 50 })}
              {input('lastName', t.lastName, { autoComplete: 'family-name', maxLength: 50 })}
            </div>
            {input('street', t.address, { autoComplete: 'address-line1', maxLength: 150 })}
            <div className="co-grid-3">
              {input('building', t.building, { autoComplete: 'address-line2', maxLength: 60 })}
              {input('floor', t.floor, { maxLength: 30 })}
              {input('apartment', t.apartment, { maxLength: 30 })}
            </div>
            <div className="co-grid-3">
              {input('city', t.city, { autoComplete: 'address-level2', maxLength: 60 })}
              <div className="co-float co-select" data-invalid={Boolean(errors.governorate)}>
                <select
                  id="co-governorate"
                  value={fields.governorate}
                  onChange={set('governorate')}
                  autoComplete="address-level1"
                  aria-invalid={Boolean(errors.governorate)}
                >
                  {GOVERNORATES.map((g) => (
                    <option key={g.en} value={g.en}>
                      {locale === 'ar' ? g.ar : g.en}
                    </option>
                  ))}
                </select>
                <label htmlFor="co-governorate">{t.governorate}</label>
                <ChevronDown aria-hidden="true" className="co-select-icon" />
              </div>
              {input('postal', t.postal, { autoComplete: 'postal-code', inputMode: 'numeric', dir: 'ltr', maxLength: 10 })}
            </div>
            {input('phone', t.phone, { type: 'tel', inputMode: 'tel', autoComplete: 'tel', dir: 'ltr', maxLength: 18 })}
            <div className="co-float">
              <textarea
                id="co-notes"
                rows={2}
                maxLength={500}
                value={fields.notes}
                onChange={set('notes')}
                placeholder=" "
              />
              <label htmlFor="co-notes">{t.notes}</label>
            </div>
            <label className="co-check">
              <input type="checkbox" checked={saveInfo} onChange={(e) => setSaveInfo(e.target.checked)} />
              <span>{t.saveInfo}</span>
            </label>
          </section>

          <section className="co-block">
            <h2 className="co-title">{t.shippingTitle}</h2>
            <div className="co-ship">
              <span>
                <strong>{t.shippingName}</strong>
                <small>{t.shippingEta}</small>
              </span>
              <strong>{money(SHIPPING_FEE_CENTS)}</strong>
            </div>
          </section>

          <section className="co-block">
            <h2 className="co-title">{t.paymentTitle}</h2>
            <p className="co-sub">{t.paymentSub}</p>
            <div className="co-pay" role="radiogroup" aria-label={t.paymentTitle}>
              {methods.map((m) => (
                <div key={m} className="co-pay-option" data-selected={method === m}>
                  <label className="co-pay-row">
                    <input
                      type="radio"
                      name="co-payment"
                      value={m}
                      checked={method === m}
                      onChange={() => setMethod(m)}
                    />
                    <span className="co-pay-title">{t.methods[m].title}</span>
                    {m !== 'CASH_ON_DELIVERY' && <PayMarks />}
                  </label>
                  {method === m && (
                    <div className="co-pay-note">
                      {m === 'CASH_ON_DELIVERY' ? (
                        <p>{t.codNote}</p>
                      ) : (
                        <p>
                          <Lock aria-hidden="true" /> {t.onlineRedirect}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {formError && (
            <p role="alert" className="cart-alert">
              {formError}
            </p>
          )}

          <button type="submit" className="co-pay-btn" disabled={busy || !ready}>
            {busy ? (
              <>
                <Loader2 className="track-spin" aria-hidden="true" />
                {status === 'redirecting' ? t.redirecting : t.placing}
              </>
            ) : online ? (
              t.payNow
            ) : (
              t.completeOrder
            )}
          </button>

          <nav className="co-legal">
            <Link href={`/${locale}/track-order`}>{t.policies}</Link>
            <Link href={`/${locale}#contact`}>{dict.footer.contactUs}</Link>
          </nav>
        </fieldset>
      </form>

      <aside className="co-side" aria-label={t.summary}>
        <OrderSummary locale={locale} />
      </aside>
    </div>
  );
}
