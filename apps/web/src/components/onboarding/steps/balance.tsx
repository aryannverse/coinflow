'use client'
import { formatINR, parseRupeesToPaise } from '@/lib/money'
import { LabeledInput } from './labeled-input'
import { StepHeading } from './step-heading'

export function BalanceStep({ balance, setBalance, error }: { balance: string; setBalance: (v: string) => void; error?: string }) {
  const typed = balance.trim()
  const paise = parseRupeesToPaise(typed.endsWith('.') ? typed.slice(0, -1) : typed)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <StepHeading>Roughly how much is in your account right now?</StepHeading>
        <p className="text-muted-foreground">No bank login. A rough number is fine, and you can refresh it anytime. Skip it if you’d rather not say yet.</p>
      </div>
      <LabeledInput
        id="ob-balance"
        label="Balance in rupees"
        inputMode="decimal"
        value={balance}
        onChange={(e) => setBalance(e.target.value)}
        className="amount min-h-14 text-2xl md:text-2xl"
        placeholder="50,000"
        hint={paise !== null ? formatINR(paise) : 'e.g. 50,000 or 1250.50'}
        error={error}
      />
    </div>
  )
}
