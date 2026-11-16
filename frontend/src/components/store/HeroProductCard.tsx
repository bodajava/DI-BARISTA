'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Dictionary, Locale } from '@/lib/i18n';
import type { IHeroProduct } from '@/lib/storefront-products';
import { useCart } from './cart/CartProvider';

function RoastDots({
  score,
  prefix,
  name,
}: {
  score: number;
  prefix: string;
  name: string;
}) {
  return (
    <span className="roast" title={`${prefix}: ${name}`}>
      <span className="roast-dots" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} data-on={i < score} />
        ))}
      </span>
      <span className="roast-label">
        <span className="sr-only">{prefix}: </span>
        {name}
      </span>
    </span>
  );
}

/** Featured-coffee card that sits on the hero video, with a 1/N pager */
export function HeroProductCard({
  products,
  t,
  roastNames,
  addingLabel,
  locale,
}: {
  products: IHeroProduct[];
  t: Dictionary['hero'];
  roastNames: Record<string, string>;
  addingLabel: string;
  locale: Locale;
}) {
  const [index, setIndex] = useState(0);
  const { addItem, pending } = useCart();
  const count = products.length;
  const product = products[index];
  if (!product) return null;

  const go = (step: number) => setIndex((i) => (i + step + count) % count);

  return (
    <aside className="hero-card-wrap" aria-label={t.featured}>
      <span className="hero-card-stack" aria-hidden="true" />
      <article className="hero-card" key={product.id}>
        {count > 1 && (
          <div className="hero-card-pager">
            <button type="button" onClick={() => go(-1)} aria-label={t.previous}>
              <span className="flip-rtl" aria-hidden="true">‹</span>
            </button>
            <span aria-live="polite">
              {index + 1}/{count}
            </span>
            <button type="button" onClick={() => go(1)} aria-label={t.next}>
              <span className="flip-rtl" aria-hidden="true">›</span>
            </button>
          </div>
        )}

        <Link
          href={`/${locale}/products/${product.slug}`}
          className="hero-card-media"
          tabIndex={-1}
          aria-hidden="true"
        >
          {product.images[0] && (
            // Catalog images come from the admin uploads (S3) or /public; plain <img> avoids
            // having to whitelist every image host for next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={product.images[0]} alt={product.name} loading="lazy" />
          )}
        </Link>

        <div className="hero-card-body">
          <h2 className="hero-card-title">
            <Link href={`/${locale}/products/${product.slug}`}>{product.name}</Link>
          </h2>
          <div className="hero-card-meta">
            <p className="hero-card-notes">{product.notes}</p>
            <RoastDots
              score={product.roastScore}
              prefix={t.roast}
              name={roastNames[product.roastLevel] ?? product.roastLevel}
            />
          </div>
        </div>

        <div className="hero-card-foot">
          <span className="hero-card-price">{product.price}</span>
          <button
            type="button"
            className="hero-card-add"
            disabled={pending === product.id}
            onClick={() => addItem(product.id, product.defaultGrind)}
          >
            {pending === product.id ? addingLabel : `+ ${t.addToBag}`}
          </button>
        </div>
      </article>
    </aside>
  );
}
