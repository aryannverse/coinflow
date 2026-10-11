'use client'
import ElasticSlider from '@/components/reactbits/ElasticSlider'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { formatINR } from '@/lib/money'

/** Budget slider in paise: controlled, ARIA slider with keyboard support; elastic physics only when motion is allowed. */
export function BudgetSlider({
  value,
  onValueChange,
  max,
  step = 50_000,
  label,
}: {
  value: number
  onValueChange: (paise: number) => void
  max: number
  step?: number
  label: string
}) {
  const reduced = useReducedMotion()
  return (
    <ElasticSlider
      value={value}
      onValueChange={onValueChange}
      min={0}
      max={max}
      step={step}
      label={label}
      valueText={(v) => formatINR(v)}
      elastic={!reduced}
      leftIcon={<span className="text-muted-foreground">−</span>}
      rightIcon={<span className="text-muted-foreground">+</span>}
    />
  )
}
