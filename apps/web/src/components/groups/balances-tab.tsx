'use client'
import { ArrowRight, HandCoins } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useBalances, useMarkSettlement, useResolveSettlement } from '@/hooks/group-queries'
import type { GroupDetailDTO, PaymentDTO } from '@/lib/api-types'
import { markedPaise, markedPayment, paymentHeadline, waitingForPayee } from '@/lib/group-display'
import { formatINR } from '@/lib/money'
import { whyText } from '@/lib/settle'
import { cn } from '@/lib/utils'
import { useGroupSheets } from './group-sheets'
import { MemberAvatar } from './member-avatar'
import { useReturnFocus } from './sheet-frame'

const SettlementGraph = dynamic(() => import('./settlement-graph').then((m) => m.SettlementGraph), {
  ssr: false,
  loading: () => <div aria-hidden className="h-80 rounded-tile bg-surface-2" />,
})

/** Where one member stands, in words (the graph shows the same numbers, but is decorative). */
function standing(net: number, isMe: boolean): string {
  if (net > 0) return `${isMe ? 'are' : 'is'} owed ${formatINR(net)}`
  if (net < 0) return `${isMe ? 'owe' : 'owes'} ${formatINR(-net)}`
  return isMe ? 'are settled' : 'is settled'
}

/** Spec §3.5 Balances: simplified payments with "Why?", a Settle up button on each of YOUR payments, pending marks, and the graph. */
export function BalancesTab({ group }: { group: GroupDetailDTO }) {
  const balances = useBalances(group.id)
  const sheets = useGroupSheets()
  const mark = useMarkSettlement()
  const resolve = useResolveSettlement()
  const [openWhy, setOpenWhy] = useState<number | null>(null)
  const [recording, setRecording] = useState<PaymentDTO | null>(null)
  const names = new Map(group.members.map((m) => [m.id, m.displayName]))
  const byId = new Map(group.members.map((m) => [m.id, m]))
  const me = group.myMemberId
  const recordBack = useReturnFocus()
  // Confirm / Not received remove their own buttons; focus lands on the section heading instead of <body>.
  const keepFocus = { onSuccess: () => document.getElementById('bal-h')?.focus() }

  if (balances.isPending) {
    return <div role="status" aria-label="Loading balances" className="flex flex-col gap-3"><Skeleton className="h-28 rounded-tile" /><Skeleton className="h-28 rounded-tile" /></div>
  }
  if (balances.isError) {
    return (
      <div role="alert" className="rounded-tile border bg-card p-5">
        <p className="text-muted-foreground">Couldn’t load balances.</p>
        <Button variant="outline" className="mt-3 min-h-12 rounded-chip" onClick={() => void balances.refetch()}>Try again</Button>
      </div>
    )
  }
  const { payments, pending, nets } = balances.data
  const people = group.members.filter((m) => !m.removedAt || nets.some((n) => n.memberId === m.id && n.netPaise !== 0))

  return (
    <section aria-labelledby="bal-h" className="flex flex-col gap-6">
      <h2 id="bal-h" tabIndex={-1} className="sr-only">Balances</h2>
      {payments.length === 0 ? (
        <div className="flex items-center gap-4 rounded-tile border bg-card p-5">
          <span aria-hidden className="grid size-12 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><HandCoins className="size-6" /></span>
          <div>
            <p className="font-medium">Everyone’s settled up.</p>
            <p className="text-sm text-muted-foreground">New expenses show up here as who pays whom.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Fewest payments to settle</h3>
          <ul aria-label="Who pays whom" className="grid gap-3 lg:grid-cols-2">
            {payments.map((p, i) => {
              const from = byId.get(p.from)
              const to = byId.get(p.to)
              const mine = p.from === me || p.to === me
              // Already marked (pending): say so, instead of a second "Settle up" that invites paying twice.
              const marked = p.from === me && to ? markedPayment(pending, me, p.to, to) : null
              const rest = p.amountPaise - markedPaise(pending, me, p.to)
              return (
                <li key={`${p.from}-${p.to}`} id={`pay-${i}`}
                  className={cn('scroll-mt-24 rounded-tile border bg-card p-4', mine && 'border-primary/50')}>
                  <div aria-hidden className="mb-3 flex items-center gap-2">
                    <MemberAvatar name={from?.displayName ?? '?'} claimed={from?.claimed ?? true} size={36} />
                    <ArrowRight className="size-4 text-muted-foreground" />
                    <MemberAvatar name={to?.displayName ?? '?'} claimed={to?.claimed ?? true} size={36} />
                    <span className="amount ml-auto text-xl">{formatINR(p.amountPaise)}</span>
                  </div>
                  <p className="font-medium">{paymentHeadline(p, names, me)}</p>
                  <details className="group/why mt-1" open={openWhy === i}
                    onToggle={(e) => {
                      const isOpen = (e.currentTarget as HTMLDetailsElement).open
                      setOpenWhy((cur) => (isOpen ? i : cur === i ? null : cur))
                    }}>
                    <summary className="inline-flex min-h-12 cursor-pointer items-center rounded-chip text-sm text-primary underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring">Why?</summary>
                    <p className="rounded-chip bg-surface-2 p-3 text-sm text-muted-foreground">{whyText(p, names, me)}</p>
                  </details>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.from === me && to && !marked && (
                      <Button className="min-h-12 rounded-chip active:scale-[0.97]" aria-label={`Settle up ${formatINR(p.amountPaise)} with ${to.displayName}`}
                        onClick={() => sheets.openSettle({ groupId: group.id, toMemberId: p.to, amountPaise: p.amountPaise })}>Settle up</Button>
                    )}
                    {p.from === me && to && marked && (
                      <>
                        <p className="flex min-h-12 w-full items-center text-sm text-muted-foreground">{marked}</p>
                        <Button variant="outline" className="min-h-12 rounded-chip active:scale-[0.97]" aria-label={`Paid more? Mark another payment to ${to.displayName}`}
                          onClick={() => sheets.openSettle({ groupId: group.id, toMemberId: p.to, amountPaise: rest > 0 ? rest : p.amountPaise })}>Paid more?</Button>
                      </>
                    )}
                    {p.to === me && (
                      <Button variant="outline" className="min-h-12 rounded-chip active:scale-[0.97]"
                        onClick={() => sheets.openReminder({ groupId: group.id, fromMemberId: p.from, amountPaise: p.amountPaise })}>Send a reminder</Button>
                    )}
                    {p.to === me && from && !from.claimed && (
                      <Button variant="ghost" className="min-h-12 rounded-chip active:scale-[0.97]" onClick={() => setRecording(p)}>Record cash received</Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {pending.length > 0 && (
        <section aria-labelledby="pending-h" className="flex flex-col gap-2">
          <h3 id="pending-h" className="font-display text-lg">Waiting for confirmation</h3>
          <ul className="flex flex-col gap-2">
            {pending.map((s) => {
              const amount = formatINR(s.amountPaise)
              const toMe = s.toMember === me
              const payee = byId.get(s.toMember)
              const text = s.fromMember === me
                ? `You marked ${amount} paid to ${names.get(s.toMember)}. ${payee ? waitingForPayee(payee) : ''}`.trim()
                : toMe ? `${names.get(s.fromMember)} says they paid you ${amount}.` : `${names.get(s.fromMember)} marked ${amount} paid to ${names.get(s.toMember)}.`
              return (
                <li key={s.id} className="rounded-chip border border-dashed bg-surface-2/60 p-3 text-sm">
                  <p>{text}</p>
                  {toMe && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button className="min-h-12 rounded-chip active:scale-[0.97]" aria-disabled={resolve.isPending || undefined}
                        onClick={() => { if (!resolve.isPending) resolve.mutate({ settlementId: s.id, decision: 'confirm' }, keepFocus) }}>Confirm</Button>
                      <Button variant="outline" className="min-h-12 rounded-chip active:scale-[0.97]" aria-disabled={resolve.isPending || undefined}
                        onClick={() => { if (!resolve.isPending) resolve.mutate({ settlementId: s.id, decision: 'reject' }, keepFocus) }}>Not received</Button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {payments.length > 0 && (
        <figure className="flex flex-col gap-2">
          <SettlementGraph members={group.members} nets={nets} payments={payments} meId={me}
            onSelect={(i) => {
              setOpenWhy(i)
              document.getElementById(`pay-${i}`)?.scrollIntoView({ block: 'nearest' })
            }} />
          <figcaption className="text-sm text-muted-foreground">The same payments as a map. Tap an arrow to see why.</figcaption>
        </figure>
      )}

      <section aria-labelledby="nets-h" className="rounded-tile border bg-card p-4">
        <h3 id="nets-h" className="font-mono text-xs uppercase tracking-[0.12em] text-muted-foreground">Where everyone stands</h3>
        <ul className="mt-2 flex flex-col">
          {people.map((m) => {
            const net = nets.find((n) => n.memberId === m.id)?.netPaise ?? 0
            return (
              <li key={m.id} className="flex min-h-12 items-center gap-3 border-b last:border-b-0">
                <MemberAvatar name={m.displayName} claimed={m.claimed} size={28} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {m.isMe ? 'You' : m.displayName} {standing(net, m.isMe)}
                </span>
                <span className={cn('amount shrink-0 text-sm', net > 0 ? 'text-primary' : net < 0 ? 'text-neutral-negative' : 'text-muted-foreground')} aria-hidden>
                  {net === 0 ? '—' : formatINR(net, { signed: true })}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <Dialog open={recording !== null} onOpenChange={(o) => !o && setRecording(null)}>
        <DialogContent {...recordBack.props} className="rounded-tile sm:max-w-sm">
          {recording && (
            <>
              <DialogTitle>Record {formatINR(recording.amountPaise)} from {names.get(recording.from)}?</DialogTitle>
              <DialogDescription>Only if they paid you outside Coinflow, like cash. They haven’t joined yet, so this counts straight away.</DialogDescription>
              <DialogFooter>
                <Button variant="outline" className="min-h-12 rounded-chip" onClick={() => setRecording(null)}>Cancel</Button>
                <Button className="min-h-12 rounded-chip" onClick={() => {
                  const r = recording
                  recordBack.redirectTo('bal-h') // the payment row and its button change once it counts
                  setRecording(null)
                  const label = `Recorded ${formatINR(r.amountPaise)} from ${names.get(r.from)}`
                  // Confirmed at once with no undo (plan A7), so no undo toast either: say it worked.
                  mark.mutate({ groupId: group.id, body: { fromMemberId: r.from, toMemberId: me, amountPaise: r.amountPaise }, label },
                    { onSuccess: () => toast.success(label) })
                }}>Record</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  )
}
