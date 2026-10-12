'use client'
import { Check } from 'lucide-react'
import { useReducedMotion } from '@/components/providers/motion-pref'
import { BorderBeam } from '@/components/ui/border-beam'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api-client'
import type { ChatItem } from '@/lib/agent-chat'
import { approvedText, planBudgetLines } from '@/lib/proposal-apply'
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
  const progress = item.progress
  const budgets = p.kind === 'plan_bundle' ? planBudgetLines(p, actions.catName) : []

  async function approve() {
    if (item.state === 'saving') return
    agent.chat.markProposal(item.id, 'saving', undefined, progress)
    try {
      await actions.approve(p, { progress, onProgress: (pr) => agent.chat.markProposal(item.id, 'saving', undefined, pr) })
      agent.chat.markProposal(item.id, 'approved')
    } catch (err) {
      agent.chat.markProposal(item.id, 'failed', err instanceof ApiError ? err.message : 'Couldn’t save that. Try again, or tap Edit.')
    }
  }

  function edit() {
    actions.edit(p)
    agent.chat.markProposal(item.id, 'editing') // Approve goes away: the sheet that opened is now where it gets saved
  }

  return (
    <article aria-label={`${KIND[p.kind]} proposal: ${p.summary}`} className="relative my-2 overflow-hidden rounded-tile border bg-card p-4">
      {open && !reduced && <BorderBeam size={90} duration={7} colorFrom="var(--primary)" colorTo="var(--chart-2)" />}
      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
        {KIND[p.kind]} · {item.state === 'approved' ? 'done' : item.state === 'editing' ? 'opened to edit' : 'not saved yet'}
      </p>
      <p className="mt-1 font-medium">{p.summary}</p>
      {p.kind === 'plan_bundle' && p.payload.checklist && p.payload.checklist.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">{p.payload.checklist.map((c) => <li key={c}>{c}</li>)}</ul>
      )}
      {budgets.length > 0 && (
        <ul aria-label="Monthly plans it sets" className="mt-2 space-y-0.5 text-sm">{budgets.map((b) => <li key={b}>{b}</li>)}</ul>
      )}
      {item.state === 'failed' && p.kind === 'plan_bundle' && progress?.groupId && (
        <p className="mt-2 text-sm text-muted-foreground">
          The group is created and {progress.budgetsDone ?? 0} of {p.payload.budgets.length} plans are set. Approve sets the rest.
        </p>
      )}
      {item.state === 'approved' && <p role="status" className="mt-2 flex items-center gap-1.5 text-sm"><Check className="size-4 text-primary" aria-hidden />{approvedText(p)}</p>}
      {item.state === 'editing' && <p role="status" className="mt-2 text-sm text-muted-foreground">Opened for editing. Save it there, or dismiss this draft.</p>}
      {item.state === 'dismissed' && <p role="status" className="mt-2 text-sm text-muted-foreground">Dismissed.</p>}
      {item.state === 'failed' && <p role="alert" className="mt-2 text-sm text-neutral-negative">{item.error}</p>}
      {(open || item.state === 'editing') && (
        <div className="mt-3 flex flex-wrap gap-2">
          {open && (
            <Button onClick={() => void approve()} aria-disabled={item.state === 'saving' || undefined} className="min-h-12 rounded-chip active:scale-[0.97]">
              {item.state === 'saving' ? 'Saving…' : 'Approve'}
            </Button>
          )}
          <Button variant="outline" onClick={edit} className="min-h-12 rounded-chip active:scale-[0.97]">{item.state === 'editing' ? 'Edit again' : 'Edit'}</Button>
          <Button variant="ghost" onClick={() => { actions.dismiss(p); agent.chat.markProposal(item.id, 'dismissed') }} className="min-h-12 rounded-chip active:scale-[0.97]">Dismiss</Button>
        </div>
      )}
    </article>
  )
}
