'use client'
import { LabeledInput } from './labeled-input'
import { StepHeading } from './step-heading'

export function WelcomeStep({ name, setName, error }: { name: string; setName: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <StepHeading>Hi! What should we call you?</StepHeading>
      <p className="text-muted-foreground">Coinflow is your money, first. Splitting with friends comes later.</p>
      <LabeledInput id="ob-name" label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="given-name" error={error} />
    </div>
  )
}
