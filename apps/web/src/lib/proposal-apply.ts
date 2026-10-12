import type { ReceiptDTO } from './api-types'
import type { ExpenseDraft } from './expense-form'
import { formatINR, paiseToRupeeString } from './money'
import type { ProposalInput } from './schemas/proposals'

type TxnProposal = Extract<ProposalInput, { kind: 'expense' | 'income' }>
export type QuickPrefill = {
  type: 'expense' | 'income'; amount: number; categoryId: string; note: string | null; method?: string; occurredAt?: string; source?: 'chat' | 'voice' | 'scan'
}

const iso = (v: unknown): string | undefined => {
  if (typeof v !== 'string' && !(v instanceof Date)) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** Edit on an expense/income chip opens quick add prefilled, keeping where it came from (spec §4.4). */
export function quickAddPrefill(p: TxnProposal): QuickPrefill {
  const src = p.payload.source
  return {
    type: p.payload.type, amount: p.payload.amount, categoryId: p.payload.categoryId, note: p.payload.note ?? null,
    ...(p.payload.method ? { method: p.payload.method } : {}),
    ...(iso(p.payload.occurredAt) ? { occurredAt: iso(p.payload.occurredAt) } : {}),
    ...(src && src !== 'manual' ? { source: src } : {}),
  }
}

const rupees = (p: number) => (p ? paiseToRupeeString(p) : '')

/** Spec §4.5: a scanned receipt fills the itemized canvas; the user assigns people to lines. */
export function receiptToDraft(r: ReceiptDTO): Partial<ExpenseDraft> {
  return {
    description: r.merchant ?? 'Receipt',
    amount: paiseToRupeeString(r.totalPaise),
    occurredAt: r.date ? new Date(`${r.date}T12:00:00+05:30`).toISOString() : null,
    mode: 'itemized',
    items: r.items.map((it, i) => ({ key: `scan-${i}`, name: it.name, amount: paiseToRupeeString(it.amountPaise), memberIds: [] })),
    tax: rupees(r.taxPaise), tip: rupees(r.tipPaise), discount: rupees(r.discountPaise),
  }
}

export function receiptNotice(r: ReceiptDTO): string | undefined {
  if (r.mismatch) {
    const diff = formatINR(Math.abs(r.mismatchPaise))
    return `The receipt’s total, ${formatINR(r.totalPaise)}, is ${diff} ${r.mismatchPaise > 0 ? 'more' : 'less'} than its lines. Check the items before saving.`
  }
  if (r.confidence < 0.6) return 'Some numbers may be misread. Please check them before saving.'
  return undefined
}

type PlanProposal = Extract<ProposalInput, { kind: 'plan_bundle' }>
/** How far an approved plan got: kept on the chip so a retry never creates a second group. */
export type PlanProgress = { groupId?: string; budgetsDone?: number }

/** What the chip says once approved. Only ledger saves have an undo toast; groups and reminders don't, so no promise. */
export function approvedText(p: ProposalInput): string {
  switch (p.kind) {
    case 'settle_reminder':
      return 'Reminder opened. You send it yourself.'
    case 'group_event':
      return 'Group created.'
    case 'plan_bundle': {
      const n = p.payload.budgets.length
      return n ? `Plan saved: group created and ${n} budget${n === 1 ? '' : 's'} set.` : 'Plan saved: group created.'
    }
    default:
      return 'Saved. You can undo from the toast.'
  }
}

/** A plan sets monthly plans too; the chip shows each one before Approve. */
export function planBudgetLines(p: PlanProposal, catName: (id: string) => string): string[] {
  return p.payload.budgets.map((b) => `Sets ${catName(b.categoryId)} plan to ${formatINR(b.monthlyLimit)}/month`)
}

/** Creates the plan's group once, then the budgets not yet set, reporting progress after each step. */
export async function applyPlanBundle(
  p: PlanProposal,
  progress: PlanProgress,
  deps: {
    createGroup: (body: PlanProposal['payload']['event']) => Promise<{ id: string }>
    upsertBudget: (b: { categoryId: string; monthlyLimit: number }) => Promise<unknown>
    onProgress: (pr: Required<PlanProgress>) => void
  },
): Promise<string> {
  let groupId = progress.groupId
  let done = progress.budgetsDone ?? 0
  if (!groupId) {
    groupId = (await deps.createGroup(p.payload.event)).id
    done = 0
    deps.onProgress({ groupId, budgetsDone: 0 })
  }
  for (let i = done; i < p.payload.budgets.length; i++) {
    await deps.upsertBudget(p.payload.budgets[i])
    deps.onProgress({ groupId, budgetsDone: i + 1 })
  }
  return groupId
}
