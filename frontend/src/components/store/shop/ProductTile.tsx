'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { IStoreProduct } from '@/lib/storefront-products';
import { useCart } from '../cart/CartProvider';

/**
 * Pack shots that change with the pointer: the image is split into invisible vertical
 * zones (one per photo), so sweeping the mouse across it flips through the angles.
 * On touch screens a horizontal swipe does the same; the bars at the bottom are buttons
 * for keyboard users.
 */
function ProductGallery({
  images,
  alt,
  photoLabel,
  href,
}: {
  images: string[];
  alt: string;
  photoLabel: (n: number, total: number) => string;
  href: string;
}) {
  const [active, setActive] = useState(0);
  const swipeStart = useRef<number | null>(null);
  /** A swipe on touch must flip photos, not open the product */
  const justSwiped = useRef(false);
  const count = images.length;

  const isRtl = (el: HTMLElement) => getComputedStyle(el).direction === 'rtl';

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || count < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    let ratio = (e.clientX - rect.left) / rect.width;
    if (isRtl(e.currentTarget)) ratio = 1 - ratio;
    const next = Math.min(count - 1, Math.max(0, Math.floor(ratio * count)));
    if (next !== active) setActive(next);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') swipeStart.current = e.clientX;
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (start === null || count < 2) return;
    let dx = e.clientX - start;
    if (Math.abs(dx) < 30) return;
    if (isRtl(e.currentTarget)) dx = -dx;
    justSwiped.current = true;
    window.setTimeout(() => (justSwiped.current = false), 350);
    setActive((i) => (dx < 0 ? (i + 1) % count : (i - 1 + count) % count));
  };

  return (
    <div
      className="tile-media"
      onPointerMove={onPointerMove}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setActive(0)}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={() => (swipeStart.current = null)}
    >
      {images.map((src, i) => (
        // Catalog images come from /public or the admin's S3 uploads; plain <img> avoids
        // whitelisting every host for next/image.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={src}
          src={src}
          alt={i === 0 ? alt : ''}
          aria-hidden={i === active ? undefined : true}
          data-active={i === active}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      ))}

      <Link
        href={href}
        className="tile-link"
        aria-label={alt}
        tabIndex={-1}
        onClick={(e) => {
          if (justSwiped.current) e.preventDefault();
        }}
      />

      {count > 1 && (
        <div className="tile-dots">
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              data-active={i === active}
              aria-label={photoLabel(i + 1, count)}
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              onFocus={() => setActive(i)}
            >
              <span />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RoastDots({ score, label }: { score: number; label: string }) {
  return (
    <span className="roast-dots" title={label} role="img" aria-label={label}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} data-on={i < score} />
      ))}
    </span>
  );
}

export function ProductTile({
  product,
  locale,
}: {
  product: IStoreProduct;
  locale: Locale;
}) {
  const dict = getDictionary(locale);
  const t = dict.shop;
  const { addItem, pending } = useCart();
  const adding = pending === product.id;
  const roastName = dict.roast[product.roastLevel] ?? product.roastLevel;
  const href = `/${locale}/products/${product.slug}`;

  return (
    <article className="tile">
      <div className="tile-frame">
        {product.isFeatured && (
          <span className="tile-badge" role="img" aria-label={t.bestseller}>
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <path id={`badge-${product.id}`} d="M50,50 m-36,0 a36,36 0 1,1 72,0 a36,36 0 1,1 -72,0" />
              </defs>
              <text>
                <textPath href={`#badge-${product.id}`}>
                  {`${t.bestseller} · ${t.bestseller} · `}
                </textPath>
              </text>
              <circle cx="50" cy="50" r="22" />
            </svg>
          </span>
        )}
        {product.images.length > 0 ? (
          <ProductGallery
            images={product.images}
            alt={product.name}
            photoLabel={t.photo}
            href={href}
          />
        ) : (
          <div className="tile-media" />
        )}
      </div>

      <div className="tile-info">
        <div className="tile-head">
          <h3 className="tile-title">
            <Link href={href}>{product.name}</Link>
          </h3>
          <RoastDots
            score={product.roastScore}
            label={`${dict.hero.roast}: ${roastName}`}
          />
        </div>
        {product.notes && <p className="tile-notes">{product.notes}</p>}
        <div className="tile-foot">
          <span className="tile-price">
            {product.hasOptions && <span className="tile-from">{t.from} </span>}
            {product.price}
          </span>
          <button
            type="button"
            className="tile-add"
            disabled={adding}
            onClick={() => addItem(product.id, product.defaultGrind)}
          >
            {adding ? dict.cart.adding : `+ ${dict.hero.addToBag}`}
          </button>
        </div>
      </div>
    </article>
  );
}
