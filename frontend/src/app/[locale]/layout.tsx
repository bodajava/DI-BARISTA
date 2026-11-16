import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { Archivo, Inter, Readex_Pro } from 'next/font/google';
import './store.css';
import {
  LOCALES,
  LOCALE_META,
  getDictionary,
  isLocale,
} from '@/lib/i18n';
import { SITE_NAME, SITE_URL, SITE_KEYWORDS, toJsonLd } from '@/lib/site';
import { CartProvider } from '@/components/store/cart/CartProvider';
import { CartDrawer } from '@/components/store/cart/CartDrawer';
import { SearchDialog } from '@/components/store/search/SearchDialog';
import { SiteHeader } from '@/components/store/SiteHeader';
import { RouteScrollSync, SmoothScroll } from '@/components/store/motion/SmoothScroll';
import { Suspense } from 'react';

/** Wide display face for the wordmark, nav and labels (expanded via the wdth axis) */
const display = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-display',
  display: 'swap',
});

/** Body copy (product notes, prices) */
const body = Inter({
  subsets: ['latin'],
  variable: '--font-body',
  display: 'swap',
});

/** Arabic: Readex Pro has an HEXP axis, so it can be widened to match Archivo */
const arabic = Readex_Pro({
  subsets: ['arabic', 'latin'],
  axes: ['HEXP'],
  variable: '--font-arabic',
  display: 'swap',
  preload: false,
});

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }));
}

type LayoutParams = { params: Promise<{ locale: string }> };

export async function generateMetadata({
  params,
}: LayoutParams): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale);
  const meta = LOCALE_META[locale];

  return {
    metadataBase: new URL(SITE_URL),
    title: { default: t.meta.title, template: `%s | ${SITE_NAME}` },
    description: t.meta.description,
    keywords: SITE_KEYWORDS,
    applicationName: SITE_NAME,
    alternates: {
      canonical: `/${locale}`,
      languages: { en: '/en', ar: '/ar', 'x-default': '/en' },
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: meta.ogLocale,
      alternateLocale: LOCALES.filter((l) => l !== locale).map(
        (l) => LOCALE_META[l].ogLocale,
      ),
      url: `/${locale}`,
      title: t.meta.title,
      description: t.meta.description,
    },
    twitter: {
      card: 'summary_large_image',
      title: t.meta.title,
      description: t.meta.description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
    },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3EDE4' },
    { media: '(prefers-color-scheme: dark)', color: '#0C0907' },
  ],
};

/** Applies the saved light/dark choice before first paint (no flash). No choice = follow the OS. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/**
 * Hides [data-reveal] content before first paint so GSAP can animate it in without a flash.
 * Safety net: if the animation code never runs, everything is shown after 2.5s.
 */
const MOTION_SCRIPT = `(function(){var d=document.documentElement;if(!window.matchMedia||matchMedia("(prefers-reduced-motion: reduce)").matches)return;d.classList.add("js-motion");setTimeout(function(){d.classList.add("motion-ready")},2500)})()`;

const SITE_JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/media/brand-mark.png`,
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Cairo',
        addressCountry: 'EG',
      },
    },
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      url: SITE_URL,
      name: SITE_NAME,
      inLanguage: ['en', 'ar'],
      publisher: { '@id': `${SITE_URL}/#organization` },
    },
  ],
};

export default async function StoreRootLayout({
  children,
  params,
}: LayoutParams & { children: React.ReactNode }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const meta = LOCALE_META[locale];

  return (
    <html
      lang={meta.htmlLang}
      dir={meta.dir}
      className={`${display.variable} ${body.variable} ${arabic.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION_SCRIPT }} />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: toJsonLd(SITE_JSON_LD) }}
        />
      </head>
      <body className="store-body" suppressHydrationWarning>
        <CartProvider errorMessage={getDictionary(locale).cart.error}>
          <SiteHeader locale={locale} t={getDictionary(locale).nav} />
          <SmoothScroll>{children}</SmoothScroll>
          <Suspense fallback={null}>
            <RouteScrollSync />
          </Suspense>
          <CartDrawer locale={locale} />
          <SearchDialog locale={locale} />
        </CartProvider>
      </body>
    </html>
  );
}
