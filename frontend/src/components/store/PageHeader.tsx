
/** Header for inner pages: same frame, strip and nav as the hero, on espresso instead of video */
/** Without a title it's just the strip + space for the fixed nav (used by product pages) */
export function PageHeader({ title }: { title?: string }) {
  return (
    <header className="hero-frame page-frame" data-nav="dark">
      <div className="hero-strip" aria-hidden="true" />
      <div className="page-stage" data-compact={!title || undefined}>
        {title && (
          <h1 className="page-title" data-reveal>
            {title}
          </h1>
        )}
      </div>
    </header>
  );
}
