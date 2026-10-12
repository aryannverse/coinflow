import { z } from 'zod'
import { paise, uuid } from './common'
import { groupCreateSchema, groupExpenseInputSchema } from './groups'
import { recurringCreateSchema } from './recurring'
import { transactionCreateSchema } from './transactions'

/**
 * Spec §4.4: proposals are validated with the SAME schemas as the API, so a chip the user sees can be saved as is.
 * Group membership is checked separately on the server (agent-proxy.ts validateProposal).
 */
const base = { id: z.uuid(), summary: z.string().min(1).max(300) }
const budgetBody = z.object({ categoryId: uuid, monthlyLimit: paise }).strict()

export const proposalSchema = z.discriminatedUnion('kind', [
  z.object({ ...base, kind: z.literal('expense'), payload: transactionCreateSchema }).strict(),
  z.object({ ...base, kind: z.literal('income'), payload: transactionCreateSchema }).strict(),
  z.object({ ...base, kind: z.literal('group_expense'), groupId: uuid, payload: groupExpenseInputSchema }).strict(),
  z.object({ ...base, kind: z.literal('recurring'), payload: recurringCreateSchema }).strict(),
  z.object({ ...base, kind: z.literal('budget'), payload: budgetBody }).strict(),
  z.object({ ...base, kind: z.literal('group_event'), payload: groupCreateSchema }).strict(),
  z.object({ ...base, kind: z.literal('settle_reminder'), groupId: uuid, payload: z.object({ memberId: uuid, amountPaise: paise }).strict() }).strict(),
  z.object({
    ...base, kind: z.literal('plan_bundle'),
    payload: z.object({ event: groupCreateSchema, budgets: z.array(budgetBody).max(12), checklist: z.array(z.string().min(1).max(120)).max(20) }).strict(),
  }).strict(),
]).superRefine((p, ctx) => {
  if (p.kind !== 'expense' && p.kind !== 'income') return
  if (p.payload.type !== p.kind) ctx.addIssue({ code: 'custom', path: ['payload', 'type'], message: 'Type and kind disagree.' })
  if (!p.payload.source || p.payload.source === 'manual') ctx.addIssue({ code: 'custom', path: ['payload', 'source'], message: 'AI proposals carry chat, voice or scan.' })
})
export type Proposal = z.infer<typeof proposalSchema>
/** The wire shape (what the chip holds and what is saved): dates are still strings. */
export type ProposalInput = z.input<typeof proposalSchema>
