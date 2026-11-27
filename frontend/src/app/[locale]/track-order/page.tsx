import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/store/PageHeader';
import { TrackOrderForm } from '@/components/store/track/TrackOrderForm';
import { SiteFooter } from '@/components/store/SiteFooter';
import { getDictionary, isLocale } from '@/lib/i18n';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const t = getDictionary(locale).track;
  return {
    title: t.metaTitle,
    description: t.intro,
    alternates: {
      canonical: `/${locale}/track-order`,
      languages: { en: '/en/track-order', ar: '/ar/track-order' },
    },
  };
}

export default async function TrackOrderPage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).track;

  return (
    <>
      <PageHeader title={t.title} locale={locale} />
      <main id="main" className="track-page" data-nav="page">
        <p className="track-intro">{t.intro}</p>
        {/* The form reads ?order= from the URL (links in confirmation emails), so it streams in */}
        <Suspense fallback={<div className="track-card track-card-skeleton" aria-hidden="true" />}>
          <TrackOrderForm locale={locale} />
        </Suspense>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
