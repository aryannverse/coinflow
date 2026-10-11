export function sliderKeyStep(
  key: string,
  value: number,
  o: { min: number; max: number; step: number; page: number },
): number | null {
  const clamp = (v: number) => Math.min(o.max, Math.max(o.min, v))
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return clamp(value + o.step)
    case 'ArrowLeft':
    case 'ArrowDown':
      return clamp(value - o.step)
    case 'PageUp':
      return clamp(value + o.page)
    case 'PageDown':
      return clamp(value - o.page)
    case 'Home':
      return o.min
    case 'End':
      return o.max
    default:
      return null
  }
}
