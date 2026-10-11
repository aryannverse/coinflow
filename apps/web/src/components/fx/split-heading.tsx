/**
 * Per-character heading entrance, pure CSS so it renders on the server and is never hidden by JS:
 * each word is an inline-block (so wrapping stays word-based) and each character rises in with a staggered
 * `animation-delay` (`.hero-char` in globals.css). The animated copy is aria-hidden; one sr-only copy carries
 * the heading text for assistive tech. Reduced motion (OS query or the in-app override) shows static text.
 */
export function SplitHeading({ as = 'h1', id, text, className }: { as?: 'h1' | 'h2'; id?: string; text: string; className?: string }) {
  const Tag = as
  // Spread the stagger over the whole heading but cap it at STEPS * 25ms (+ 0.4s rise), so the heading is fully
  // visible within ~650ms however long it is.
  const STEPS = 10
  const total = Math.max(1, [...text.replace(/ /g, '')].length - 1)
  let index = 0
  return (
    <Tag id={id} className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.split(' ').map((word, w) => (
          <span key={w}>
            {w > 0 ? ' ' : null}
            <span className="inline-block whitespace-nowrap">
              {[...word].map((char, c) => (
                <span key={c} className="hero-char inline-block" style={{ '--i': Math.round((index++ * STEPS) / total) } as React.CSSProperties}>
                  {char}
                </span>
              ))}
            </span>
          </span>
        ))}
      </span>
    </Tag>
  )
}
