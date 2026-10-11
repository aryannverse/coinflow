'use client'
import { LabeledInput } from './labeled-input'
import { StepHeading } from './step-heading'

export function IncomeStep({ income, setIncome, payday, setPayday, incomeError, paydayError }: {
  income: string
  setIncome: (v: string) => void
  payday: string
  setPayday: (v: string) => void
  incomeError?: string
  paydayError?: string
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <StepHeading>When does money come in?</StepHeading>
        <p className="text-muted-foreground">Your pay cycle runs from one payday to the next. Skip the income if it varies.</p>
      </div>
      <LabeledInput id="ob-income" label="Monthly income (₹, optional)" inputMode="decimal" value={income} onChange={(e) => setIncome(e.target.value)} className="amount" placeholder="90,000" error={incomeError} />
      <LabeledInput id="ob-payday" label="Payday (day of month)" inputMode="numeric" maxLength={2} value={payday} onChange={(e) => setPayday(e.target.value)} className="w-28" placeholder="1" error={paydayError} />
    </div>
  )
}
