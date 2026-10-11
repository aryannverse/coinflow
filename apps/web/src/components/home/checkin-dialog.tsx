'use client'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { useCheckin } from '@/hooks/queries'
import { ApiError } from '@/lib/api-client'
import { formatINR, parseRupeesToPaise } from '@/lib/money'
import { cn } from '@/lib/utils'
import { XIcon } from 'lucide-react'

/** The form is mounted per opening (Radix unmounts closed content), so value and error start fresh every time. */
function CheckinForm({ onClose, onDone }: { onClose: () => void; onDone?: () => void }) {
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const checkin = useCheckin()
  const paise = parseRupeesToPaise(value)
  const amountError = fieldError?.field === 'amount' ? fieldError.message : null
  const otherError = fieldError && fieldError.field !== 'amount' ? fieldError.message : null

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (paise === null || checkin.isPending) return
    setFieldError(null)
    checkin.mutate(
      { amount: paise },
      {
        onSuccess: () => {
          onClose()
          onDone?.()
        },
        onError: (err) => {
          // useLedgerMutation does not toast field errors, so this form owns them.
          if (!(err instanceof ApiError) || !err.field) return
          setFieldError({ field: err.field, message: err.message })
          if (err.field === 'amount') input.current?.focus()
        },
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor="checkin-amount" className="sr-only">Balance in rupees</label>
      <div className={cn('flex items-baseline gap-1 border-b-2 pb-2 focus-within:border-primary', amountError && 'border-neutral-negative')}>
        <span className="amount text-3xl text-muted-foreground" aria-hidden>₹</span>
        <input
          ref={input}
          id="checkin-amount"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (fieldError) setFieldError(null)
          }}
          aria-invalid={amountError ? true : undefined}
          aria-describedby={amountError ? 'checkin-amount-error' : 'checkin-amount-hint'}
          className="amount min-h-12 w-full bg-transparent text-4xl outline-none placeholder:text-muted-foreground/60"
          placeholder="50,000"
        />
      </div>
      {amountError ? (
        <p id="checkin-amount-error" role="alert" className="mt-1 text-sm font-medium text-neutral-negative">{amountError}</p>
      ) : (
        <p id="checkin-amount-hint" className="mt-1 text-sm text-muted-foreground">
          {paise !== null ? formatINR(paise) : value.trim() === '' ? 'Enter the amount in rupees' : 'Numbers only, like 50,000 or 1250.50'}
        </p>
      )}
      {otherError && <p role="alert" className="mt-1 text-sm font-medium text-neutral-negative">{otherError}</p>}
      <Button type="submit" disabled={paise === null || checkin.isPending} className="mt-4 min-h-12 w-full active:scale-[0.97]">
        {checkin.isPending ? 'Saving…' : 'Save balance'}
      </Button>
    </form>
  )
}

export function CheckinDialog({ trigger, onDone }: { trigger: React.ReactNode; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        className="rounded-tile"
        showCloseButton={false}
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          document.getElementById('checkin-amount')?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle className="font-display pr-12">What’s in your account right now?</DialogTitle>
          <DialogDescription>A rough number is fine. Coinflow tracks changes from here, no bank login needed.</DialogDescription>
        </DialogHeader>
        <CheckinForm onClose={() => setOpen(false)} onDone={onDone} />
        <DialogClose asChild>
          <Button variant="ghost" className="absolute top-3 right-3 min-h-12 min-w-12 active:scale-[0.97]">
            <XIcon aria-hidden />
            <span className="sr-only">Close</span>
          </Button>
        </DialogClose>
      </DialogContent>
    </Dialog>
  )
}
