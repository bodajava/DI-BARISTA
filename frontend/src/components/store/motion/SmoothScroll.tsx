'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  ScrollSmoother,
  ScrollTrigger,
  bindMarquees,
  bindParallax,
  bindReveals,
  gsap,
  playHeroIntro,
  revealAllNow,
  useGSAP,
} from './gsap';

const HEADER_GAP = 72;

function scrollToHash(hash: string, smooth = true) {
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  const target = id ? document.getElementById(id) : null;
  if (!target) return false;
  const smoother = ScrollSmoother.get();
  if (smoother) {
    smoother.scrollTo(target, smooth, `top ${HEADER_GAP}px`);
  } else {
    const top = target.getBoundingClientRect().top + window.scrollY - HEADER_GAP;
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }
  return true;
}

/**
 * GSAP ScrollSmoother around the page content (desktop pointers only; touch keeps native
 * momentum scrolling) plus the site-wide scroll animations. Everything is skipped for
 * visitors who prefer reduced motion. Fixed UI (header, bag, search, pill) lives outside
 * #smooth-content, otherwise the transform would make it scroll with the page.
 */
export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const wrapper = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        {
          fine: '(pointer: fine)',
          motion: '(prefers-reduced-motion: no-preference)',
        },
        (context) => {
          const { fine, motion } = context.conditions as { fine: boolean; motion: boolean };
          if (fine && motion) {
            ScrollSmoother.create({
              wrapper: wrapper.current!,
              content: content.current!,
              smooth: 1.15,
              effects: true,
              smoothTouch: false,
            });
          }
          if (motion) {
            playHeroIntro();
            bindReveals();
            bindParallax();
            bindMarquees();
          }
          revealAllNow();
          if (window.location.hash) {
            gsap.delayedCall(0.1, () => scrollToHash(window.location.hash, false));
          }
          return () => ScrollSmoother.get()?.kill();
        },
      );
    },
    { scope: wrapper, dependencies: [pathname], revertOnUpdate: true },
  );

  // Same-page anchor links (#shop, #catalog…) go through the smoother instead of a jump
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) return;
      const link = (event.target as HTMLElement | null)?.closest('a');
      if (!link || link.target === '_blank') return;
      const url = new URL(link.href, window.location.href);
      if (
        url.origin !== window.location.origin ||
        url.pathname !== window.location.pathname ||
        url.search !== window.location.search ||
        !url.hash
      ) {
        return;
      }
      if (scrollToHash(url.hash)) {
        event.preventDefault();
        event.stopPropagation();
        window.history.pushState(null, '', url.hash);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  return (
    <div id="smooth-wrapper" ref={wrapper}>
      <div id="smooth-content" ref={content}>
        {children}
      </div>
    </div>
  );
}

/**
 * After client-side navigations that only change the query (shop tabs, pages), animate the
 * new content in, recompute trigger positions and bring the #catalog anchor into view.
 * Lives in its own Suspense boundary because it reads search params.
 */
export function RouteScrollSync() {
  const searchParams = useSearchParams();
  const key = searchParams.toString();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const raf = requestAnimationFrame(() => {
      bindReveals();
      bindParallax();
      ScrollTrigger.refresh();
      if (window.location.hash) scrollToHash(window.location.hash);
    });
    return () => cancelAnimationFrame(raf);
  }, [key]);

  return null;
}
