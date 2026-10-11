'use client'
import { LabeledInput } from './labeled-input'
import { StepHeading } from './step-heading'

export function FixedCostsStep({ value, setValue, error }: { value: string; setValue: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <StepHeading>Everyday basics</StepHeading>
        <p className="text-muted-foreground">
          About how much goes on groceries and commute each month? We spread it across your cycle so Safe-to-Spend stays honest. Optional.
        </p>
      </div>
      <LabeledInput id="ob-fixed" label="Monthly basics (₹)" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} className="amount" placeholder="8,000" error={error} />
    </div>
  )
}
