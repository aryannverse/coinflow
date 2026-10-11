/**
 * Dither colours + canvas opacity per theme. Colours mirror the design tokens (`--background`, `--lime`);
 * `styles.tokens.test.ts` asserts the match and that the worst-case pixel keeps body text at >= 4.5:1.
 */
export const HERO_DITHER = {
  dark: { wave: '#C8F560', background: '#0E100F', opacity: 0.18 },
  light: { wave: '#C8F560', background: '#F4F6F1', opacity: 0.5 },
} as const

const channel = (hex: string, i: number) => parseInt(hex.slice(i, i + 2), 16)

/** Brightest/most-wave pixel the canvas can show over a page of the same background: wave colour at canvas opacity. */
export function worstCasePixel(wave: string, background: string, opacity: number): string {
  return (
    '#' +
    [1, 3, 5]
      .map((i) => {
        const b = channel(background, i)
        return Math.round(b + opacity * (channel(wave, i) - b)).toString(16).padStart(2, '0')
      })
      .join('')
  )
}
