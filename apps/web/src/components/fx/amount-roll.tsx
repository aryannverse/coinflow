'use client'
import Counter from '@/components/reactbits/Counter'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { inrPlaceGroups } from '@/lib/inr-groups'
import { formatINR } from '@/lib/money'
import { cn } from '@/lib/utils'

/**
 * Rolling-digit ₹ amount (React Bits Counter) for live entry such as quick add.
 * Counter derives each digit from the full value, so one Counter per en-IN group
 * (3 digits, then pairs) with literal commas between gives ₹12,50,000 while rolling.
 * Rolling path: sr-only label, digits are aria-hidden. Static `formatINR` when reduced or negative.
 */
export function AmountRoll({ paise, className, fontSize = 48 }: { paise: number; className?: string; fontSize?: number }) {
  const reduced = useReducedMotion()
  const label = formatINR(paise)
  if (reduced || paise < 0) {
    return (
      // Same size as the rolling digits, so reduced motion does not shrink the amount to body text.
      <span className={cn('amount', className)} data-amount={label} style={{ fontSize, lineHeight: 1 }}>
        {label}
      </span>
    )
  }
  const value = paise / 100
  const groups = inrPlaceGroups(Math.trunc(value))
  const counter = (places: (number | '.')[]) => (
    <Counter
      key={String(places[places.length - 1])}
      value={value}
      places={places}
      fontSize={fontSize}
      gap={0}
      horizontalPadding={0}
      borderRadius={0}
      gradientHeight={0}
    />
  )
  return (
    <span className={cn('amount', className)} data-amount={label}>
      <span className="sr-only">{label}</span>
      <span aria-hidden className="inline-flex items-center" style={{ lineHeight: 1 }}>
        <span style={{ fontSize }}>₹</span>
        {groups.map((group, i) => (
          <span key={group[group.length - 1]} className="inline-flex items-center">
            {i > 0 && <span aria-hidden style={{ fontSize }}>,</span>}
            {counter(group)}
          </span>
        ))}
        {paise % 100 !== 0 && counter(['.', 0.1, 0.01])}
      </span>
    </span>
  )
}
