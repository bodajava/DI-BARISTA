'use client';

import { useEffect, useRef } from 'react';
import { ScrollTrigger, bindParallax, bindReveals } from './gsap';

/**
 * Place inside a streamed [data-stream] region: animates that region in after React has
 * hydrated it (its effect can't run earlier), then re-measures scroll triggers.
 * `watch` re-runs it when the region's content changes (e.g. another shop page).
 */
export function RevealHere({ watch }: { watch?: string }) {
  const marker = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const root = marker.current?.closest('[data-stream]');
    if (!root) return;
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      bindReveals(root);
      bindParallax();
    }
    ScrollTrigger.refresh();
  }, [watch]);
  return <span ref={marker} hidden />;
}
