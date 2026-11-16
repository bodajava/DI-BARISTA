'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useState } from 'react';
import {
  LOCALE_COOKIE,
  swapLocaleInPath,
  type Dictionary,
  type Locale,
} from '@/lib/i18n';
import { useCart } from './cart/CartProvider';
import { openSearch } from './search/SearchDialog';

type NavDict = Dictionary['nav'];

function toggleTheme() {
  const root = document.documentElement;
  const current =
    root.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  try {
    localStorage.setItem('theme', next);
  } catch {
    // Private mode: the choice just won't persist
  }
}

function rememberLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** Label shows the theme you would switch TO; CSS picks the right one so SSR never mismatches */
function ThemeButton({ t, className }: { t: NavDict; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={toggleTheme}
      aria-label={t.themeLabel}
    >
      <span className="only-light">{t.themeDark}</span>
      <span className="only-dark">{t.themeLight}</span>
    </button>
  );
}

function CartButton({ t }: { t: NavDict }) {
  const { cart, setOpen } = useCart();
  const count = cart.totalItemsCount;
  return (
    <button
      type="button"
      className="nav-link nav-cart"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
    >
      <span>{t.cart}</span>
      <span className="nav-cart-count" data-filled={count > 0}>
        {count > 99 ? '99+' : count}
      </span>
    </button>
  );
}

/** Brand mark, centred in the bar; goes home */
function NavLogo({ locale, className }: { locale: Locale; className: string }) {
  return (
    <Link href={`/${locale}`} className={className} aria-label="DI BARISTA">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/media/brand-mark.png" alt="" width={40} height={40} />
    </Link>
  );
}

export function SiteNav({ locale, t }: { locale: Locale; t: NavDict }) {
  const pathname = usePathname() || `/${locale}`;
  const other: Locale = locale === 'en' ? 'ar' : 'en';
  const otherHref = swapLocaleInPath(pathname, other);
  const [open, setOpen] = useState(false);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Absolute so they also work from inner pages such as /ar/track-order
  const primary = [
    { href: `/${locale}#shop`, label: t.shop },
    { href: `/${locale}#story`, label: t.story },
    { href: `/${locale}#origins`, label: t.origins },
  ];
  const trackHref = `/${locale}/track-order`;

  return (
    <nav className="site-nav" aria-label={t.label}>
      {/* Desktop */}
      <ul className="nav-group nav-primary">
        {primary.map((item) => (
          <li key={item.href}>
            <Link className="nav-link" href={item.href}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <NavLogo locale={locale} className="nav-logo" />
      <ul className="nav-group nav-utility">
        <li>
          <button
            type="button"
            className="nav-link"
            onClick={openSearch}
            aria-haspopup="dialog"
            aria-keyshortcuts="/"
          >
            {t.search}
          </button>
        </li>
        <li>
          <Link
            className="nav-link"
            href={trackHref}
            aria-current={pathname === trackHref ? 'page' : undefined}
          >
            {t.trackOrder}
          </Link>
        </li>
        <li>
          <a
            className="nav-link nav-lang"
            href={otherHref}
            hrefLang={other}
            lang={other}
            aria-label={t.switchLanguageLabel}
            onClick={() => rememberLocale(other)}
          >
            {t.switchLanguage}
          </a>
        </li>
        <li>
          <ThemeButton t={t} className="nav-link" />
        </li>
        <li>
          <CartButton t={t} />
        </li>
      </ul>

      {/* Mobile */}
      <div className="nav-mobile">
        <button
          type="button"
          className="nav-link"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t.close : t.menu}
        </button>
        <NavLogo locale={locale} className="nav-logo-mobile" />
        <CartButton t={t} />
      </div>
      <div id={panelId} className="nav-sheet" data-open={open} hidden={!open}>
        <ul>
          {primary.map((item) => (
            <li key={item.href}>
              <Link
                className="nav-sheet-link"
                href={item.href}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="nav-sheet-link"
              onClick={() => {
                setOpen(false);
                openSearch();
              }}
            >
              {t.search}
            </button>
          </li>
          <li>
            <Link
              className="nav-sheet-link"
              href={trackHref}
              onClick={() => setOpen(false)}
            >
              {t.trackOrder}
            </Link>
          </li>
        </ul>
        <div className="nav-sheet-row">
          <a
            className="nav-chip"
            href={otherHref}
            hrefLang={other}
            lang={other}
            aria-label={t.switchLanguageLabel}
            onClick={() => rememberLocale(other)}
          >
            {t.switchLanguage}
          </a>
          <ThemeButton t={t} className="nav-chip" />
        </div>
      </div>
    </nav>
  );
}
