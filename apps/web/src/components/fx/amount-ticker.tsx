'use client'
import { useState } from 'react'
import { NumberTicker } from '@/components/ui/number-ticker'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Counts an amount in ₹ (en-IN grouping). `data-amount` always carries the final formatted value.
 * Animated path: sr-only label for assistive tech, ticker is aria-hidden. Static for reduced motion and negatives.
 * `from`: `'zero'` counts up from ₹0 (landing showcase); `'value'` starts at the first amount it is given, so
 * the server-rendered HTML already shows the real number and only later changes animate (Home, onboarding).
 */
export function AmountTicker({ paise, className, signed, from = 'zero' }: {
  paise: number; className?: string; signed?: boolean; from?: 'zero' | 'value'
}) {
  const reduced = useReducedMotion()
  // Frozen at mount: a start that followed `paise` would make React rewrite the text the tween is driving.
  const [start] = useState(() => (from === 'value' ? Math.max(0, paise) / 100 : 0))
  const label = formatINR(paise, { signed })
  if (reduced || paise < 0) {
    return (
      <span className={cn('amount', className)} data-amount={label}>
        {label}
      </span>
    )
  }
  const hasPaise = paise % 100 !== 0
  return (
    <span className={cn('amount', className)} data-amount={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden>
        {signed && paise > 0 ? '+₹' : '₹'}
        <NumberTicker
          value={paise / 100}
          startValue={start}
          decimalPlaces={hasPaise ? 2 : 0}
          className="text-inherit tracking-[inherit] dark:text-inherit"
        />
      </span>
    </span>
  )
}
