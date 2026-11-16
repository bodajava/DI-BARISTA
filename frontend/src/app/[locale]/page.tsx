import { notFound } from 'next/navigation';
import { Hero } from '@/components/store/Hero';
import { ShopSection } from '@/components/store/shop/ShopSection';
import { RitualSection } from '@/components/store/RitualSection';
import { JournalSection } from '@/components/store/JournalSection';
import { MarqueeBand } from '@/components/store/MarqueeBand';
import { ExploreSection } from '@/components/store/ExploreSection';
import { StorySection } from '@/components/store/StorySection';
import { SiteFooter } from '@/components/store/SiteFooter';
import { isLocale } from '@/lib/i18n';

export default async function HomePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <>
      <Hero locale={locale} />
      <main id="main" className="store-main">
        {/* searchParams is passed down un-awaited so only the grid waits for it (the rest stays static) */}
        <ShopSection locale={locale} searchParams={searchParams} />
        <RitualSection locale={locale} />
        <JournalSection locale={locale} />
        <MarqueeBand locale={locale} />
        <ExploreSection locale={locale} />
        <StorySection locale={locale} />
      </main>
      <SiteFooter locale={locale} />
    </>
  );
}
