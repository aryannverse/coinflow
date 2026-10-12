'use client'
import { Check, Copy } from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'
import { Spark } from '@/components/fx/spark'
import { Button } from '@/components/ui/button'
import { DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useGroup, useMarkSettlement } from '@/hooks/group-queries'
import { ApiError } from '@/lib/api-client'
import { waitingForPayee } from '@/lib/group-display'
import { formatINR, paiseToRupeeString, parseRupeesToPaise } from '@/lib/money'
import { MoneyInput } from './money-input'
import { SheetFrame } from './sheet-frame'

/**
 * Spec §3.5 settle up. Coinflow never moves money: show the payee's UPI QR (or a "no QR yet" state with their
 * UPI ID), let the payer pay in their own UPI app, then "I've paid" creates a pending settlement the payee confirms.
 */
function SettleBody({ groupId, toMemberId, amountPaise, onClose }: { groupId: string; toMemberId: string; amountPaise: number; onClose: () => void }) {
  const group = useGroup(groupId)
  const payee = group.data?.members.find((m) => m.id === toMemberId)
  const me = group.data?.members.find((m) => m.isMe)
  const mark = useMarkSettlement()
  const [amount, setAmount] = useState(() => paiseToRupeeString(amountPaise))
  const [copied, setCopied] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const doneRef = useRef<HTMLButtonElement>(null)
  if (!group.data || !payee) {
    return (
      <div className="px-6 pb-6 pt-1">
        <DialogTitle className="sr-only">Settle up</DialogTitle>
        <DialogDescription className="sr-only">Loading</DialogDescription>
        <p role="status">Loading…</p>
      </div>
    )
  }
  const name = payee.displayName

  async function copy() {
    if (!payee?.upiId) return
    try {
      await navigator.clipboard.writeText(payee.upiId)
      setCopied(true)
    } catch {
      setError('Couldn’t copy. Long-press the UPI ID to copy it.')
    }
  }

  async function paid() {
    if (mark.isPending) return
    const paise = parseRupeesToPaise(amount.trim())
    if (!paise) return setError('Enter the amount you paid.')
    setError(null)
    try {
      await mark.mutateAsync({
        groupId,
        body: { fromMemberId: group.data!.myMemberId, toMemberId, amountPaise: paise },
        label: `Marked ${formatINR(paise)} paid to ${name}`,
      })
      setDone(true)
      // The "I’ve paid" button is gone now; keep focus in the sheet, on the way out.
      requestAnimationFrame(() => doneRef.current?.focus())
    } catch (err) {
      if (err instanceof ApiError && err.field) setError(err.message)
      else if (!(err instanceof ApiError)) setError('Couldn’t save that. Please try again.')
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 pb-5 pt-1 lg:px-6">
      <div>
        <DialogTitle className="font-display text-xl">Pay {name}</DialogTitle>
        <DialogDescription className="text-sm text-muted-foreground">{group.data.emoji} {group.data.name} · suggested {formatINR(amountPaise)}</DialogDescription>
      </div>

      {payee.upiQrUrl ? (
        <figure className="mx-auto flex flex-col items-center gap-2">
          <div className="rounded-tile bg-white p-3">
            <Image src={payee.upiQrUrl} alt={`${name}’s UPI QR code`} width={224} height={224} unoptimized className="size-56 object-contain" />
          </div>
          <figcaption className="text-sm text-muted-foreground">Scan with any UPI app</figcaption>
        </figure>
      ) : (
        <div role="note" className="rounded-tile border-2 border-dashed p-4 text-sm">
          <p className="font-medium">No QR yet</p>
          <p className="text-muted-foreground">
            {payee.upiId ? `Pay ${name} at the UPI ID below in any UPI app.` : `${name} hasn’t added a UPI ID yet. Pay the way you usually do, then mark it here.`}
          </p>
        </div>
      )}

      {payee.upiId && (
        <div className="flex flex-col gap-1">
          <div className="flex min-h-12 items-center gap-2 rounded-chip border bg-surface-2 px-3">
            <span className="min-w-0 flex-1 truncate font-mono text-sm">{payee.upiId}</span>
            <Button type="button" variant="ghost" onClick={() => void copy()} className="min-h-12 gap-1.5 rounded-chip active:scale-[0.97]">
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} Copy UPI ID
            </Button>
          </div>
          {/* A placeholder's ID was typed by a member, not by them: say who, so the payer can check before paying. */}
          {!payee.claimed && (
            <p className="text-sm text-muted-foreground">
              {payee.upiSetByName ? `UPI ID added by ${payee.upiSetByName === me?.displayName ? 'you' : payee.upiSetByName}` : 'UPI ID added by a group member'}. Check it with {name} if you’re unsure.
            </p>
          )}
        </div>
      )}
      <p role="status" className="sr-only">{copied ? 'UPI ID copied' : ''}</p>

      {done ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="rounded-chip bg-surface-2 p-3 text-sm">Marked as paid. {waitingForPayee(payee)}</p>
          <Button ref={doneRef} type="button" variant="outline" className="min-h-12 rounded-chip active:scale-[0.97]" onClick={onClose}>Done</Button>
        </div>
      ) : (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>Pay in your UPI app.</li>
            <li>Come back and tap “I’ve paid”.</li>
            <li>{payee.claimed ? `${name} confirms when it arrives.` : `${name} confirms once they join Coinflow.`}</li>
          </ol>
          <MoneyInput id="settle-amount" label="Amount you paid" hideLabel={false} value={amount} invalid={Boolean(error)} onChange={(v) => { setAmount(v); setError(null) }} />
          {error && <p role="alert" className="text-sm text-neutral-negative">{error}</p>}
          <Spark>
            <Button type="button" onClick={() => void paid()} aria-disabled={mark.isPending || undefined} className="min-h-14 w-full rounded-chip text-base active:scale-[0.97]">
              {mark.isPending ? 'Saving…' : 'I’ve paid'}
            </Button>
          </Spark>
        </>
      )}
    </div>
  )
}

export function SettleSheet({ open, openCount, groupId, toMemberId, amountPaise, onClose }: {
  open: boolean; openCount: number; groupId: string; toMemberId: string; amountPaise: number; onClose: () => void
}) {
  return (
    <SheetFrame open={open} onClose={onClose} initialFocus="#settle-amount">
      <SettleBody key={openCount} groupId={groupId} toMemberId={toMemberId} amountPaise={amountPaise} onClose={onClose} />
    </SheetFrame>
  )
}
