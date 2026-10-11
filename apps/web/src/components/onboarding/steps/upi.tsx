'use client'
import { UpiQrUpload } from '@/components/profile/upi-qr-upload'
import { LabeledInput } from './labeled-input'
import { StepHeading } from './step-heading'

export function UpiStep({ upiId, setUpiId, error }: { upiId: string; setUpiId: (v: string) => void; error?: string }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <StepHeading>How do friends pay you back?</StepHeading>
        <p className="text-muted-foreground">Used later for splitting. Coinflow never moves money: friends pay in their own UPI app. Optional.</p>
      </div>
      <LabeledInput id="ob-upi" label="UPI ID (optional)" value={upiId} onChange={(e) => setUpiId(e.target.value)} autoCapitalize="none" spellCheck={false} placeholder="name@okaxis" error={error} />
      <UpiQrUpload />
    </div>
  )
}
