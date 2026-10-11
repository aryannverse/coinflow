'use client'
import Counter from '@/components/reactbits/Counter'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

type Place = number | '.'

/** Place values for a non-negative amount: whole-rupee digits, then ".", tenths and hundredths when paise are present. */
function placesFor(paise: number): Place[] {
  const rupees = Math.trunc(paise / 100)
  const digits = String(rupees).length
  const places: Place[] = Array.from({ length: digits }, (_, i) => 10 ** (digits - 1 - i))
  if (paise % 100 !== 0) places.push('.', 0.1, 0.01)
  return places
}

/**
 * Rolling-digit ₹ amount (React Bits Counter) for live entry such as quick add.
 * Rolling path: sr-only label, digits are aria-hidden. Static `formatINR` when reduced or negative.
 */
export function AmountRoll({ paise, className, fontSize = 48 }: { paise: number; className?: string; fontSize?: number }) {
  const reduced = useReducedMotion()
  const label = formatINR(paise)
  if (reduced || paise < 0) {
    return (
      <span className={cn('amount', className)} data-amount={label}>
        {label}
      </span>
    )
  }
  return (
    <span className={cn('amount', className)} data-amount={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="inline-flex items-center">
        <span style={{ fontSize }}>₹</span>
        <Counter
          value={paise / 100}
          places={placesFor(paise)}
          fontSize={fontSize}
          gap={0}
          horizontalPadding={0}
          borderRadius={0}
          gradientHeight={0}
        />
      </span>
    </span>
  )
}
