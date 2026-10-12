'use client'
import { useRouter } from 'next/navigation'
import { useGroupSheets } from '@/components/groups/group-sheets'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { useCreateGroup, useCreateGroupExpense } from '@/hooks/group-queries'
import { useCategories, useCreateRecurring, useCreateTransaction, useUpsertBudget } from '@/hooks/queries'
import { api } from '@/lib/api-client'
import { draftFromBody } from '@/lib/expense-form'
import { applyPlanBundle, quickAddPrefill, type PlanProgress } from '@/lib/proposal-apply'
import type { RecurringCreate } from '@/lib/schemas/recurring'
import type { GroupExpenseBody } from '@/lib/schemas/groups'
import type { ProposalInput } from '@/lib/schemas/proposals'
import { useAgent } from './agent-provider'

/** Spec §4.4: Approve saves through the normal API (with undo); Edit opens the matching sheet; outcomes go to the thread. */
export function useProposalActions() {
  const agent = useAgent()
  const router = useRouter()
  const quick = useQuickAdd()
  const sheets = useGroupSheets()
  const createTxn = useCreateTransaction()
  const createGroupExpense = useCreateGroupExpense()
  const createRecurring = useCreateRecurring()
  const upsertBudget = useUpsertBudget()
  const createGroup = useCreateGroup()
  const { data: categories = [] } = useCategories()
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'Category'

  const log = (p: ProposalInput, outcome: 'approved' | 'dismissed' | 'edited') =>
    void api('/agent/outcome', { method: 'POST', json: { threadId: agent.chat.threadId(), proposalId: p.id, outcome, summary: p.summary } }).catch(() => undefined)

  /** `progress`/`onProgress`: a plan remembers what already saved, so Approve after a failure retries only the rest. */
  async function approve(p: ProposalInput, opts: { progress?: PlanProgress; onProgress?: (pr: PlanProgress) => void } = {}): Promise<void> {
    switch (p.kind) {
      case 'expense':
      case 'income': {
        const q = quickAddPrefill(p)
        await createTxn.mutateAsync({ type: q.type, amount: q.amount, categoryId: q.categoryId, note: q.note, method: q.method, occurredAt: q.occurredAt, source: q.source })
        break
      }
      case 'group_expense':
        await createGroupExpense.mutateAsync({ groupId: p.groupId, body: p.payload as GroupExpenseBody })
        break
      case 'recurring':
        await createRecurring.mutateAsync(p.payload as RecurringCreate)
        break
      case 'budget':
        await upsertBudget.mutateAsync({ categoryId: p.payload.categoryId, monthlyLimit: p.payload.monthlyLimit, name: catName(p.payload.categoryId) })
        break
      case 'group_event': {
        const g = await createGroup.mutateAsync(p.payload)
        agent.close()
        router.push(`/groups/${g.id}`)
        break
      }
      case 'settle_reminder':
        agent.close()
        sheets.openReminder({ groupId: p.groupId, fromMemberId: p.payload.memberId, amountPaise: p.payload.amountPaise })
        break
      case 'plan_bundle': {
        const groupId = await applyPlanBundle(p, opts.progress ?? {}, {
          createGroup: (body) => createGroup.mutateAsync(body),
          upsertBudget: (b) => upsertBudget.mutateAsync({ categoryId: b.categoryId, monthlyLimit: b.monthlyLimit, name: catName(b.categoryId) }),
          onProgress: (pr) => opts.onProgress?.(pr),
        })
        agent.close()
        router.push(`/groups/${groupId}`)
        break
      }
    }
    log(p, 'approved')
  }

  function edit(p: ProposalInput): void {
    log(p, 'edited')
    agent.close()
    switch (p.kind) {
      case 'expense':
      case 'income':
        quick.open(quickAddPrefill(p))
        break
      case 'group_expense':
        sheets.openExpense({ groupId: p.groupId, prefill: draftFromBody(p.payload as GroupExpenseBody, []) })
        break
      case 'recurring':
        agent.setEditing({ kind: 'recurring', payload: p.payload })
        break
      case 'budget':
        agent.setEditing({ kind: 'budget', payload: p.payload })
        break
      case 'group_event':
        sheets.openNewGroup({ prefill: p.payload })
        break
      case 'plan_bundle':
        sheets.openNewGroup({ prefill: p.payload.event })
        break
      case 'settle_reminder':
        sheets.openReminder({ groupId: p.groupId, fromMemberId: p.payload.memberId, amountPaise: p.payload.amountPaise })
        break
    }
  }

  return { approve, edit, dismiss: (p: ProposalInput) => log(p, 'dismissed'), catName }
}
