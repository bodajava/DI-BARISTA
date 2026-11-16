'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { Dictionary } from '@/lib/i18n';

const POSTER = '/media/hero/hero-poster.jpg';

const noopSubscribe = () => () => {};
/** false on the server and during hydration, true afterwards (portals can't be hydrated) */
function useIsClient() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Background video for the hero plus the floating "now brewing" pill, which doubles as
 * the pause control (WCAG 2.2.2: moving content longer than 5s needs one).
 * Respects prefers-reduced-motion and stops decoding while the hero is off-screen.
 */
export function HeroMedia({ t }: { t: Dictionary['hero'] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPaused = useRef(false);
  const [playing, setPlaying] = useState(false);
  const isClient = useIsClient();

  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.play().catch(() => setPlaying(false));
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // React doesn't always reflect `muted` from SSR; browsers only autoplay muted video
    v.muted = true;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduce.matches) {
      userPaused.current = true;
      v.pause();
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!userPaused.current) play();
        } else {
          v.pause();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(v);
    return () => observer.disconnect();
  }, [play]);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      userPaused.current = false;
      play();
    } else {
      userPaused.current = true;
      v.pause();
    }
  };

  return (
    <>
      <video
        ref={videoRef}
        className="hero-video"
        poster={POSTER}
        muted
        loop
        playsInline
        preload="metadata"
        aria-hidden="true"
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        <source
          src="/media/hero/hero-960.mp4"
          type="video/mp4"
          media="(max-width: 767px)"
        />
        <source src="/media/hero/hero-1600.mp4" type="video/mp4" />
      </video>

      {/* Rendered into <body> so it stays fixed above the smooth-scrolling page */}
      {isClient &&
        createPortal(
        <button
          type="button"
          className="brew-pill"
          data-playing={playing}
          onClick={toggle}
          aria-label={playing ? t.pauseVideo : t.playVideo}
        >
          <span className="brew-pill-mark" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/media/brand-mark.png" alt="" width={30} height={30} />
          </span>
          <span className="brew-pill-text">
            {playing ? t.playerPlaying : t.playerPaused}
          </span>
        </button>,
          document.body,
        )}
    </>
  );
}
