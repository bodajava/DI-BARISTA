'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Minus, Plus, Truck } from 'lucide-react';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { IStoreProductDetail } from '@/lib/storefront-products';
import { useCart } from '../cart/CartProvider';

/** Large photo + thumbnails; swipe on touch, arrow keys on the thumbnails */
function Gallery({ images, name, photoLabel }: { images: string[]; name: string; photoLabel: (n: number) => string }) {
  const [active, setActive] = useState(0);
  const start = useRef<number | null>(null);
  const count = images.length;

  if (count === 0) return <div className="pd-stage" />;

  return (
    <div className="pd-gallery">
      <div
        className="pd-stage"
        onPointerDown={(e) => {
          if (e.pointerType !== 'mouse') start.current = e.clientX;
        }}
        onPointerUp={(e) => {
          const s = start.current;
          start.current = null;
          if (s === null || count < 2) return;
          let dx = e.clientX - s;
          if (Math.abs(dx) < 30) return;
          if (getComputedStyle(e.currentTarget).direction === 'rtl') dx = -dx;
          setActive((i) => (dx < 0 ? (i + 1) % count : (i - 1 + count) % count));
        }}
      >
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={i === 0 ? name : ''}
            aria-hidden={i === active ? undefined : true}
            data-active={i === active}
            loading={i === 0 ? 'eager' : 'lazy'}
            fetchPriority={i === 0 ? 'high' : undefined}
            draggable={false}
          />
        ))}
      </div>
      {count > 1 && (
        <div className="pd-thumbs" role="tablist" aria-label={name}>
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={photoLabel(i + 1)}
              data-active={i === active}
              onClick={() => setActive(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const rtl = getComputedStyle(e.currentTarget).direction === 'rtl';
                  const forward = (e.key === 'ArrowRight') !== rtl;
                  setActive((a) => (forward ? (a + 1) % count : (a - 1 + count) % count));
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RoastDots({ score, label }: { score: number; label: string }) {
  return (
    <span className="roast-dots" role="img" aria-label={label} title={label}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} data-on={i < score} />
      ))}
    </span>
  );
}

export function ProductView({ product, locale }: { product: IStoreProductDetail; locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.product;
  const { addItem, pending } = useCart();
  const [variant, setVariant] = useState(product.variants[0]?.value ?? '');
  const [grind, setGrind] = useState(product.grinds[0] ?? product.defaultGrind);
  const [qty, setQty] = useState(1);
  // Unique radio group names (two product views on one page must not share a group)
  const groupId = useId();
  const adding = pending === product.id;
  const soldOut = product.stock <= 0;
  const maxQty = Math.max(1, Math.min(50, product.stock));
  const selected = product.variants.find((v) => v.value === variant);
  const roastName = dict.roast[product.roastLevel] ?? product.roastLevel;
  const tabName = product.tab !== 'all' ? dict.shop.tabs[product.tab] : dict.shop.tabs.all;

  // Count a product view once per visitor (the API de-duplicates), without slowing the page
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current) return;
    counted.current = true;
    void fetch('/api/products/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: product.slug }),
      keepalive: true,
    }).catch(() => undefined);
  }, [product.slug]);

  const facts = [
    [t.origin, product.origin],
    [t.process, product.process],
    [t.elevation, product.elevation],
    [t.roast, roastName],
    [t.weight, product.weightGrams ? `${product.weightGrams.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en')} g` : ''],
    [t.sku, product.sku],
  ].filter(([, v]) => v) as Array<[string, string]>;

  return (
    <div className="pd">
      <Gallery images={product.images} name={product.name} photoLabel={t.photo} />

      <div className="pd-info">
        <nav className="pd-crumbs ui-caps" aria-label="Breadcrumb">
          <Link href={`/${locale}#shop`}>{t.shop}</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/${locale}${product.tab !== 'all' ? `?tab=${product.tab}` : ''}#catalog`}>{tabName}</Link>
        </nav>

        <h1 className="pd-title">{product.name}</h1>
        {product.notes && <p className="pd-notes">{product.notes}</p>}

        <div className="pd-price-row">
          <span className="pd-price">{selected?.price ?? product.price}</span>
          <span className="pd-roast">
            <RoastDots score={product.roastScore} label={`${t.roast}: ${roastName}`} />
            <span>{roastName}</span>
          </span>
        </div>

        {product.variants.length > 1 && (
          <fieldset className="pd-options">
            <legend className="ui-caps">{t.size}</legend>
            <div className="pd-pills">
              {product.variants.map((v) => (
                <label key={v.value} className="pd-pill" data-selected={variant === v.value}>
                  <input
                    type="radio"
                    name={`${groupId}-variant`}
                    value={v.value}
                    checked={variant === v.value}
                    onChange={() => setVariant(v.value)}
                  />
                  <span>{v.label}</span>
                  <small>{v.price}</small>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {product.grinds.length > 1 && (
          <fieldset className="pd-options">
            <legend className="ui-caps">{t.grind}</legend>
            <div className="pd-pills">
              {product.grinds.map((g) => (
                <label key={g} className="pd-pill" data-selected={grind === g}>
                  <input type="radio" name={`${groupId}-grind`} value={g} checked={grind === g} onChange={() => setGrind(g)} />
                  <span>{dict.grinds[g] ?? g}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <div className="pd-buy">
          <div className="pd-qty" role="group" aria-label={t.quantity}>
            <button
              type="button"
              onClick={() => setQty((q) => Math.max(1, q - 1))}
              disabled={qty <= 1 || soldOut}
              aria-label={t.decrease}
            >
              <Minus aria-hidden="true" />
            </button>
            <span aria-live="polite">{qty.toLocaleString(locale === 'ar' ? 'ar-EG' : 'en')}</span>
            <button
              type="button"
              onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
              disabled={qty >= maxQty || soldOut}
              aria-label={t.increase}
            >
              <Plus aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="track-submit ui-caps pd-add"
            disabled={soldOut || adding}
            onClick={() => addItem(product.id, grind, { quantity: qty, variantLabel: variant || undefined })}
          >
            {adding ? (
              <>
                <Loader2 className="track-spin" aria-hidden="true" /> {t.adding}
              </>
            ) : soldOut ? (
              t.outOfStock
            ) : (
              t.addToBag
            )}
          </button>
        </div>
        {!soldOut && product.stock <= 10 && <p className="pd-low">{t.lowStock(product.stock)}</p>}
        <p className="pd-delivery">
          <Truck aria-hidden="true" /> {t.delivery}
        </p>

        {facts.length > 0 && (
          <dl className="pd-facts">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="ui-caps">{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        )}

        {product.description && (
          <div className="pd-desc">
            <h2 className="ui-caps">{t.description}</h2>
            <p>{product.description}</p>
          </div>
        )}
      </div>
    </div>
  );
}
