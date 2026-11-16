import { getDictionary, type Locale } from '@/lib/i18n';
import { AmbientVideo } from './AmbientVideo';

/** Full-width strip of slowly scrolling brand lines over a coffee-bean video */
export function MarqueeBand({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).band;
  // Two identical tracks side by side; the strip moves by exactly one track, so the loop is seamless
  const track = (hidden: boolean) => (
    <ul className="band-track" aria-hidden={hidden || undefined}>
      {t.lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );

  return (
    <section className="band" data-nav="dark" aria-label={t.label}>
      <AmbientVideo
        className="band-video"
        poster="/media/band/beans-poster.webp"
        sources={[
          { src: '/media/band/beans-960.mp4', media: '(max-width: 767px)' },
          { src: '/media/band/beans-1600.mp4' },
        ]}
      />
      <div className="band-shade" aria-hidden="true" />
      <div className="band-marquee">
        {track(false)}
        {track(true)}
      </div>
    </section>
  );
}
