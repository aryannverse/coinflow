'use client'
import { Check } from 'lucide-react'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'
import type { ChatItem } from '@/lib/agent-chat'
import type { ProposalInput } from '@/lib/schemas/proposals'
import { useAgent } from './agent-provider'
import { useProposalActions } from './use-proposal-actions'

const KIND: Record<ProposalInput['kind'], string> = {
  expense: 'Expense', income: 'Income', group_expense: 'Group expense', recurring: 'Recurring', budget: 'Budget',
  group_event: 'New group', settle_reminder: 'Reminder', plan_bundle: 'Plan',
}

/** Spec §4.4 staging chip: nothing is saved until Approve. Border Beam marks it as pending (never under reduced motion). */
export function ProposalChip({ item }: { item: Extract<ChatItem, { role: 'proposal' }> }) {
  const agent = useAgent()
  const reduced = useReducedMotion()
  const actions = useProposalActions()
  const p = item.proposal
  const open = item.state === 'pending' || item.state === 'failed' || item.state === 'saving'
  const done = p.kind === 'settle_reminder' ? 'Reminder opened. You send it yourself.' : 'Saved. You can undo from the toast.'

  async function approve() {
    if (item.state === 'saving') return
    agent.chat.markProposal(item.id, 'saving')
    try {
      await actions.approve(p)
      agent.chat.markProposal(item.id, 'approved')
    } catch (err) {
      agent.chat.markProposal(item.id, 'failed', err instanceof ApiError ? err.message : 'Couldn’t save that. Try again, or tap Edit.')
    }
  }

  return (
    <article aria-label={`${KIND[p.kind]} proposal: ${p.summary}`} className="relative my-2 overflow-hidden rounded-tile border bg-card p-4">
      {open && !reduced && <BorderBeam size={90} duration={7} colorFrom="var(--primary)" colorTo="var(--chart-2)" />}
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{KIND[p.kind]} · {item.state === 'approved' ? 'saved' : 'not saved yet'}</p>
      <p className="mt-1 font-medium">{p.summary}</p>
      {p.kind === 'plan_bundle' && p.payload.checklist && p.payload.checklist.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{p.payload.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
      )}
      {item.state === 'approved' && <p role="status" className="mt-2 flex items-center gap-1.5 text-sm"><Check className="size-4 text-primary" aria-hidden />{done}</p>}
      {item.state === 'dismissed' && <p role="status" className="mt-2 text-sm text-muted-foreground">Dismissed.</p>}
      {item.state === 'failed' && <p role="alert" className="mt-2 text-sm text-neutral-negative">{item.error}</p>}
      {open && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => void approve()} aria-disabled={item.state === 'saving' || undefined} className="min-h-12 rounded-chip active:scale-[0.97]">
            {item.state === 'saving' ? 'Saving…' : 'Approve'}
          </Button>
          <Button variant="outline" onClick={() => actions.edit(p)} className="min-h-12 rounded-chip active:scale-[0.97]">Edit</Button>
          <Button variant="ghost" onClick={() => { actions.dismiss(p); agent.chat.markProposal(item.id, 'dismissed') }} className="min-h-12 rounded-chip active:scale-[0.97]">Dismiss</Button>
        </div>
      )}
    </article>
  )
}
