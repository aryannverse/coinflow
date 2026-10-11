'use client'
import { NumberTicker } from '@/components/ui/number-ticker'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Counts an amount up in ₹ (en-IN grouping). `data-amount` always carries the final formatted value.
 * Animated path: sr-only label for assistive tech, ticker is aria-hidden. Static for reduced motion and negatives.
 */
export function AmountTicker({ paise, className, signed }: { paise: number; className?: string; signed?: boolean }) {
  const reduced = useReducedMotion()
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
          decimalPlaces={hasPaise ? 2 : 0}
          className="text-inherit tracking-[inherit] dark:text-inherit"
        />
      </span>
    </span>
  )
}
