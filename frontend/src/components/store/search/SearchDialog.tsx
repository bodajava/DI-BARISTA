'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Search, X } from 'lucide-react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { getDictionary, type Locale } from '@/lib/i18n';
import type { IStoreProduct } from '@/lib/storefront-products';
import { useCart } from '../cart/CartProvider';

export const OPEN_SEARCH_EVENT = 'dibarista:open-search';

/** Opens the search panel from anywhere (nav buttons, the "/" shortcut) */
export function openSearch() {
  window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
}

type Status = 'idle' | 'loading' | 'done' | 'error';

/** Top sheet with live, bilingual product search */
export function SearchDialog({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.search;
  const { addItem, pending } = useCart();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<IStoreProduct[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener(OPEN_SEARCH_EVENT, onOpen);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(OPEN_SEARCH_EVENT, onOpen);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Debounced fetch; an aborted request never overwrites newer results
  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const res = await fetch(
          `/api/search?locale=${locale}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        const json = (await res.json()) as { data?: IStoreProduct[] };
        if (!res.ok) throw new Error(String(res.status));
        setResults(json.data ?? []);
        setStatus('done');
      } catch (e) {
        if ((e as Error).name !== 'AbortError') setStatus('error');
      }
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, locale]);

  const q = query.trim();
  const shown = q ? results : [];
  const tabs = dict.shop.tabs;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setQuery('');
          setResults([]);
          setStatus('idle');
        }
      }}
      direction="top"
    >
      <DrawerContent
        className="search-sheet"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DrawerTitle className="sr-only">{t.label}</DrawerTitle>
        <DrawerDescription className="sr-only">{t.hint}</DrawerDescription>

        <div className="search-inner">
          <div className="search-bar">
            <Search className="search-icon" aria-hidden="true" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.placeholder}
              aria-label={t.label}
              autoComplete="off"
              enterKeyHint="search"
              className="search-input"
            />
            {status === 'loading' && (
              <Loader2 className="search-spinner" aria-hidden="true" />
            )}
            <button
              type="button"
              className="search-close"
              onClick={() => setOpen(false)}
              aria-label={t.close}
            >
              <X aria-hidden="true" />
            </button>
          </div>

          <div className="search-body" aria-live="polite">
            {!q && (
              <div className="search-empty">
                <p>{t.hint}</p>
                <p className="search-browse-label">{t.browse}</p>
                <div className="search-chips">
                  {(['capsules', 'beans', 'arabic'] as const).map((tab) => (
                    <Link
                      key={tab}
                      href={`/${locale}?tab=${tab}#catalog`}
                      className="search-chip"
                      onClick={() => setOpen(false)}
                    >
                      {tabs[tab]}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {q && status === 'error' && <p className="search-message">{t.error}</p>}

            {q && status === 'done' && shown.length === 0 && (
              <p className="search-message">{t.noResults(q)}</p>
            )}

            {shown.length > 0 && (
              <>
                <p className="search-count">{t.results(shown.length)}</p>
                <ul className="search-results">
                  {shown.map((p) => (
                    <li key={p.id} className="search-result">
                      <div className="search-thumb">
                        {p.images[0] && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt="" loading="lazy" />
                        )}
                      </div>
                      <div className="search-text">
                        <Link
                          href={`/${locale}/products/${p.slug}`}
                          className="search-name"
                          onClick={() => setOpen(false)}
                        >
                          {p.name}
                        </Link>
                        {p.notes && <p className="search-notes">{p.notes}</p>}
                      </div>
                      <div className="search-side">
                        <span className="search-price">
                          {p.hasOptions && <span className="tile-from">{dict.shop.from} </span>}
                          {p.price}
                        </span>
                        <button
                          type="button"
                          className="tile-add"
                          disabled={pending === p.id}
                          onClick={async () => {
                            setOpen(false);
                            await addItem(p.id, p.defaultGrind);
                          }}
                        >
                          {pending === p.id ? dict.cart.adding : `+ ${dict.hero.addToBag}`}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
