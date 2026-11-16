'use client';

import gsap from 'gsap';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, useGSAP);

export { gsap, ScrollSmoother, ScrollTrigger, useGSAP };

/**
 * Elements already wired up, kept in memory instead of data-* attributes: writing attributes
 * on server-rendered markup before React hydrates it causes hydration mismatches.
 */
const wired = new WeakMap<Element, Set<string>>();

/** true the first time an element is seen for a given job, false afterwards */
function firstTime(el: Element, job: string): boolean {
  let jobs = wired.get(el);
  if (!jobs) {
    jobs = new Set();
    wired.set(el, jobs);
  }
  if (jobs.has(job)) return false;
  jobs.add(job);
  return true;
}

/**
 * Streamed (Suspense) regions are marked [data-stream]. They may hydrate after the page-level
 * animation pass, and touching their markup before React hydrates it causes hydration
 * mismatches, so the global pass skips them and <RevealHere/> wires them up once hydrated.
 */
function outsideStream(el: Element, root: ParentNode): boolean {
  const stream = el.closest('[data-stream]');
  return !stream || stream === root || (root instanceof Element && root.contains(stream));
}

/** Fade-and-rise for [data-reveal] items and staggered children of [data-reveal-group] */
export function bindReveals(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    if (!outsideStream(el, root) || !firstTime(el, 'reveal')) return;
    gsap.from(el, {
      autoAlpha: 0,
      y: 36,
      duration: 1,
      ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', once: true },
    });
  });

  root
    .querySelectorAll<HTMLElement>('[data-reveal-group]')
    .forEach((group) => {
      if (!outsideStream(group, root) || !firstTime(group, 'reveal')) return;
      const items = Array.from(group.children) as HTMLElement[];
      if (!items.length) return;
      gsap.from(items, {
        autoAlpha: 0,
        y: 42,
        duration: 0.9,
        ease: 'power3.out',
        stagger: 0.08,
        scrollTrigger: { trigger: group, start: 'top 88%', once: true },
      });
    });
}

/** Instantly shows everything (reduced motion or animation setup failed) */
export function revealAllNow() {
  document.documentElement.classList.add('motion-ready');
}

/** Scroll-linked depth on big imagery */
export function bindParallax() {
  document.querySelectorAll<HTMLElement>('[data-parallax]').forEach((el) => {
    if (!firstTime(el, 'parallax')) return;
    const amount = Number(el.dataset.parallax) || 10;
    gsap.fromTo(
      el,
      { yPercent: -amount },
      {
        yPercent: amount,
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement ?? el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true,
        },
      },
    );
  });

  document.querySelectorAll<HTMLElement>('[data-zoom]').forEach((el) => {
    if (!firstTime(el, 'zoom')) return;
    gsap.fromTo(
      el,
      { scale: 1.18 },
      {
        scale: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: el.parentElement ?? el,
          start: 'top bottom',
          end: 'center center',
          scrub: true,
        },
      },
    );
  });
}

/**
 * Endless text strips: one tween moves the strip by exactly one copy of its content;
 * scrolling speeds it up for a moment (the faster you scroll, the faster it runs).
 */
export function bindMarquees() {
  document.querySelectorAll<HTMLElement>('.band-marquee').forEach((strip) => {
    if (!firstTime(strip, 'marquee')) return;
    const rtl = getComputedStyle(strip).direction === 'rtl';
    const loop = gsap.to(strip, {
      xPercent: rtl ? 50 : -50,
      duration: 38,
      ease: 'none',
      repeat: -1,
    });
    const band = strip.closest('.band') ?? strip;
    band.addEventListener('mouseenter', () => gsap.to(loop, { timeScale: 0, duration: 0.5 }));
    band.addEventListener('mouseleave', () => gsap.to(loop, { timeScale: 1, duration: 0.5 }));

    ScrollTrigger.create({
      trigger: band,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const boost = 1 + Math.min(Math.abs(self.getVelocity()) / 350, 5);
        gsap.to(loop, {
          timeScale: boost,
          duration: 0.2,
          overwrite: true,
          onComplete: () => {
            gsap.to(loop, { timeScale: 1, duration: 1.2, ease: 'power2.out' });
          },
        });
      },
    });
  });
}

/** Entrance for the hero: wordmark rises, product card and pill slide in */
export function playHeroIntro() {
  const wordmark = document.querySelector<SVGElement>('.hero-wordmark svg');
  if (!wordmark || !firstTime(wordmark, 'intro')) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.from(wordmark, { yPercent: 70, autoAlpha: 0, duration: 1.6 }, 0.1);
  const card = document.querySelector('.hero-card-wrap');
  if (card) tl.from(card, { y: 50, autoAlpha: 0, duration: 1.2 }, 0.45);
  const pill = document.querySelector('.brew-pill');
  if (pill) tl.from(pill, { scale: 0.6, autoAlpha: 0, duration: 1, ease: 'back.out(1.6)' }, 0.8);
}
