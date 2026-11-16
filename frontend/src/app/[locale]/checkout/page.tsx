import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckoutHeader } from '@/components/store/checkout/CheckoutHeader';
import { CheckoutForm } from '@/components/store/checkout/CheckoutForm';
import { enabledPaymentMethods } from '@/lib/egypt';
import { getDictionary, isLocale } from '@/lib/i18n';

type Params = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  return { title: getDictionary(locale).checkout.metaTitle, robots: { index: false, follow: false } };
}

export default async function CheckoutPage({ params }: Params) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  return (
    <>
      <CheckoutHeader locale={locale} bagLabel={dict.footer.bag} />
      <main id="main" className="checkout-page" data-nav="page">
        <h1 className="sr-only">{dict.checkout.title}</h1>
        <CheckoutForm locale={locale} methods={enabledPaymentMethods()} />
      </main>
    </>
  );
}
