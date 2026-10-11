/**
 * Money-flow beam path colour + opacity per theme. Dark keeps the lime; light needs a deep green, because
 * lime on the light page is ~1.1:1. `styles.tokens.test.ts` asserts the blended path pixel is >= 3:1 against the
 * page background (WCAG 1.4.11, non-text contrast).
 */
export const FLOW_PATH = {
  dark: { path: '#C8F560', pathOpacity: 0.5, start: '#C8F560', stop: '#7FD8C4', background: '#0E100F' },
  light: { path: '#3F6B0F', pathOpacity: 0.85, start: '#3F6B0F', stop: '#2F7D6D', background: '#F4F6F1' },
} as const
