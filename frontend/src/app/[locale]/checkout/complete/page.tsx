import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/store/PageHeader';
import { SiteFooter } from '@/components/store/SiteFooter';
import { CheckoutComplete } from '@/components/store/checkout/CheckoutComplete';
import { getDictionary, isLocale } from '@/lib/i18n';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).complete.metaTitle, robots: { index: false, follow: false } };
}

export default async function CheckoutCompletePage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = getDictionary(locale).complete;
  return (
    <>
      <PageHeader title={t.metaTitle} />
      <main id="main" className="track-page" data-nav="page">
        <Suspense fallback={<div className="track-card track-card-skeleton" aria-hidden="true" />}>
          <CheckoutComplete locale={locale} />
        </Suspense>
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
