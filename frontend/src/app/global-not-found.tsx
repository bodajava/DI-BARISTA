import type { Metadata } from 'next';
import Link from 'next/link';
import { Archivo } from 'next/font/google';
import './[locale]/store.css';

const display = Archivo({
  subsets: ['latin'],
  axes: ['wdth'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: '404 | DI BARISTA',
  robots: { index: false },
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

/** Shown for any URL that matches no route (the app has two root layouts, so this replaces app/not-found) */
export default function GlobalNotFound() {
  return (
    <html lang="en" className={display.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="store-body">
        <main className="not-found">
          <p className="not-found-code">404</p>
          <h1 className="ui-caps">This cup is empty</h1>
          <p lang="ar" dir="rtl">الصفحة دي مش موجودة</p>
          <p className="not-found-links">
            <Link className="ui-caps" href="/en">Home</Link>
            <Link href="/ar" lang="ar">الرئيسية</Link>
          </p>
        </main>
      </body>
    </html>
  );
}
