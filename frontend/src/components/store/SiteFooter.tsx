import Link from 'next/link';
import { cacheLife } from 'next/cache';
import { getDictionary, type Locale } from '@/lib/i18n';
import { SOCIAL_LINKS } from '@/lib/site';
import { AmbientVideo } from './AmbientVideo';
import { ContactForm } from './ContactForm';
import { FooterActions } from './FooterActions';

async function currentYear() {
  'use cache';
  cacheLife('days');
  return new Date().getFullYear();
}

const GALLERY = ['/media/story/social-1.webp', '/media/story/social-2.webp', '/media/story/social-3.webp'];

export async function SiteFooter({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const t = dict.footer;
  const tabs = dict.shop.tabs;
  const year = await currentYear();
  const instagram = SOCIAL_LINKS.find((s) => s.name === 'Instagram')?.url;

  return (
    <footer className="site-footer" data-nav="page" aria-label={t.label}>
      <div className="footer-cols" data-social={SOCIAL_LINKS.length > 0}>
        <nav className="footer-col" aria-label={t.help}>
          <h2 className="footer-h ui-caps">{t.help}</h2>
          <ul>
            <li>
              <Link href={`/${locale}/track-order`}>{t.trackOrder}</Link>
            </li>
            <li>
              <a href="#contact">{t.contactUs}</a>
            </li>
            <FooterActions searchLabel={t.search} bagLabel={t.bag} />
          </ul>
        </nav>

        <nav className="footer-col" aria-label={t.shop}>
          <h2 className="footer-h ui-caps">{t.shop}</h2>
          <ul>
            <li>
              <Link href={`/${locale}#catalog`}>{t.allCoffee}</Link>
            </li>
            {(['capsules', 'beans', 'arabic'] as const).map((tab) => (
              <li key={tab}>
                <Link href={`/${locale}?tab=${tab}#catalog`}>{tabs[tab]}</Link>
              </li>
            ))}
          </ul>
        </nav>

        {SOCIAL_LINKS.length > 0 && (
          <nav className="footer-col" aria-label={t.social}>
            <h2 className="footer-h ui-caps">{t.social}</h2>
            <ul>
              {SOCIAL_LINKS.map((s) => (
                <li key={s.name}>
                  <a href={s.url} target="_blank" rel="noopener noreferrer">
                    {s.name}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        <div className="footer-col footer-contact">
          <h2 className="footer-h ui-caps">{t.contactTitle}</h2>
          <ContactForm locale={locale} />
          <div className="footer-gallery">
            {GALLERY.map((src, i) => {
              // eslint-disable-next-line @next/next/no-img-element
              const img = <img src={src} alt="" width={300} height={300} loading="lazy" decoding="async" />;
              return instagram ? (
                <a key={src} href={instagram} target="_blank" rel="noopener noreferrer" aria-label={`Instagram ${i + 1}`}>
                  {img}
                </a>
              ) : (
                <span key={src}>{img}</span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="footer-brand">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="footer-mark" src="/media/brand-mark.png" alt="" width={84} height={84} />
        <p className="footer-tagline">
          {t.tagline[0]}
          <br />
          {t.tagline[1]}
        </p>
      </div>

      {/* The wordmark is a stencil: the page colour is drawn over the video with the letters cut out */}
      <div className="footer-wordmark" aria-hidden="true">
        <AmbientVideo
          className="footer-wordmark-video"
          poster="/media/hero/hero-poster.jpg"
          sources={[
            { src: '/media/hero/hero-960.mp4', media: '(max-width: 767px)' },
            { src: '/media/hero/hero-1600.mp4' },
          ]}
        />
        <svg viewBox="0 0 1400 118" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            <mask id="footer-wordmark-mask" maskUnits="userSpaceOnUse" x="-10" y="-10" width="1420" height="138">
              <rect x="-10" y="-10" width="1420" height="138" fill="white" />
              <text x="0" y="118" textLength="1400" lengthAdjust="spacing" fill="black" direction="ltr">
                DI BARISTA
              </text>
            </mask>
          </defs>
          <rect className="footer-wordmark-cover" x="-10" y="-10" width="1420" height="138" mask="url(#footer-wordmark-mask)" />
        </svg>
      </div>
      <p className="sr-only">DI BARISTA</p>

      <p className="footer-legal">{t.rights(year)}</p>
    </footer>
  );
}
