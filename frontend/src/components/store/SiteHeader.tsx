'use client';

import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import type { Dictionary, Locale } from '@/lib/i18n';
import { ScrollTrigger, gsap, useGSAP } from './motion/gsap';
import { SiteNav } from './SiteNav';

/**
 * Fixed site header.
 * - Starts inside the hero frame (under the crema strip) and docks to the top as you scroll.
 * - Slides away while scrolling down, comes back as soon as you scroll up.
 * - Reads the section underneath ([data-nav="dark" | "page"]) and switches its text and
 *   glass background so it never disappears into a background of the same colour.
 */
export function SiteHeader({ locale, t }: { locale: Locale; t: Dictionary['nav'] }) {
  const ref = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const header = ref.current;
      if (!header) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const offset = () =>
        parseFloat(getComputedStyle(header).getPropertyValue('--header-start')) || 42;
      const DOCKED = 8;

      let hidden = false;
      const show = (visible: boolean) => {
        if (visible === !hidden) return;
        hidden = !visible;
        gsap.to(header, {
          yPercent: visible ? 0 : -150,
          duration: reduce ? 0 : visible ? 0.55 : 0.4,
          ease: visible ? 'power3.out' : 'power2.in',
          overwrite: 'auto',
        });
      };

      const setup = () => {
        gsap.set(header, { y: offset() });
        if (!reduce) {
          gsap.from(header, { autoAlpha: 0, duration: 0.9, delay: 0.2, ease: 'power2.out' });
        }

        ScrollTrigger.create({
          start: 0,
          end: 'max',
          onUpdate: (self) => {
            const y = self.scroll();
            const start = offset();
            gsap.set(header, { y: Math.max(DOCKED, start - y) });
            header.dataset.scrolled = String(y > start - DOCKED);
            const menuOpen = header.querySelector('[data-open="true"]');
            if (self.direction === 1 && y > 220 && !menuOpen) show(false);
            else if (self.direction === -1 || y < 220) show(true);
          },
        });

        const sections = gsap.utils.toArray<HTMLElement>('[data-nav]');
        sections.forEach((section) => {
          ScrollTrigger.create({
            trigger: section,
            start: 'top 44px',
            end: 'bottom 44px',
            onToggle: (self) => {
              if (self.isActive) header.dataset.tone = section.dataset.nav || 'page';
            },
          });
        });
        header.dataset.tone = sections[0]?.dataset.nav || 'dark';
      };

      // Let ScrollSmoother initialise first, so these triggers measure the smoothed page
      const call = gsap.delayedCall(0.05, setup);
      return () => call.kill();
    },
    { dependencies: [pathname], revertOnUpdate: true },
  );

  // The checkout has its own focused header
  if (/\/checkout\/?$/.test(pathname)) return null;

  return (
    <header ref={ref} className="site-header" data-tone="dark" data-scrolled="false">
      <SiteNav locale={locale} t={t} />
    </header>
  );
}
