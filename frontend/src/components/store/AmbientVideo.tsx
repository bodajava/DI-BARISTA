'use client';

import { useEffect, useRef } from 'react';

/**
 * Decorative, muted looping background video. Plays only while on screen and never
 * for visitors who prefer reduced motion (they keep the poster frame).
 */
export function AmbientVideo({
  className,
  poster,
  sources,
}: {
  className?: string;
  poster: string;
  sources: Array<{ src: string; media?: string }>;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) v.play().catch(() => undefined);
        else v.pause();
      },
      { threshold: 0.1 },
    );
    observer.observe(v);
    return () => observer.disconnect();
  }, []);

  return (
    <video
      ref={ref}
      className={className}
      poster={poster}
      muted
      loop
      playsInline
      preload="none"
      aria-hidden="true"
      tabIndex={-1}
    >
      {sources.map((s) => (
        <source key={s.src} src={s.src} media={s.media} type="video/mp4" />
      ))}
    </video>
  );
}
