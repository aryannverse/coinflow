import { z } from 'zod'
import { splitMemberIds, type SplitSpec } from '../split'
import { isoDate, paise, paiseOrZero, uuid } from './common'
import { friendUserId } from './friends'
import { UPI_ID_PATTERN } from './me'

const DAY_MS = 86_400_000
const personName = z.string().trim().min(1, 'Add a name.').max(60)
const upiId = z.string().trim().regex(UPI_ID_PATTERN, 'UPI IDs look like name@bank.')
const datesInOrder = (g: { startsOn?: string | null; endsOn?: string | null }) => !g.startsOn || !g.endsOn || g.endsOn >= g.startsOn
const DATES_MSG = { path: ['endsOn'], message: 'The end date is before the start date.' }

const groupFields = {
  name: z.string().trim().min(1, 'Name it, e.g. “Goa trip”.').max(60),
  emoji: z.string().trim().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour.'),
  kind: z.enum(['group', 'event']),
  startsOn: isoDate.nullish(),
  endsOn: isoDate.nullish(),
}

export const groupCreateSchema = z.object({
  ...groupFields,
  emoji: groupFields.emoji.default('👥'),
  color: groupFields.color.default('#C8F560'),
  kind: groupFields.kind.default('group'),
  placeholders: z.array(z.object({ displayName: personName, upiId: upiId.nullish() }).strict()).max(49).default([]),
  friendIds: z.array(friendUserId).max(49).default([]), // spec §3.8: friends join directly as claimed members
}).strict().refine(datesInOrder, DATES_MSG)
  .refine((g) => g.placeholders.length + g.friendIds.length <= 49, { message: 'A group can have up to 50 people.', path: ['placeholders'] })
export type GroupCreateBody = z.input<typeof groupCreateSchema>
export type GroupCreate = z.infer<typeof groupCreateSchema>

export const groupPatchSchema = z.object(groupFields).partial().strict().refine(datesInOrder, DATES_MSG)
export type GroupPatch = z.infer<typeof groupPatchSchema>

export const memberCreateSchema = z.object({ displayName: personName, upiId: upiId.nullish() }).strict()
export const memberPatchSchema = memberCreateSchema.partial().strict()
export type MemberCreate = z.infer<typeof memberCreateSchema>
export type MemberPatch = z.infer<typeof memberPatchSchema>

export const claimSchema = z.union([z.object({ memberId: uuid }).strict(), z.object({ newName: personName }).strict()])
export type ClaimBody = z.infer<typeof claimSchema>

const people = z.array(uuid).max(50)
export const splitSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('equal'), memberIds: people.min(1, 'Pick at least one person to split with.') }).strict(),
  z.object({ mode: z.literal('exact'), entries: z.array(z.object({ memberId: uuid, paise: paiseOrZero }).strict()).min(1).max(50) }).strict(),
  z.object({ mode: z.literal('shares'), entries: z.array(z.object({ memberId: uuid, shares: z.number().int().min(0).max(1000) }).strict()).min(1).max(50) }).strict(),
  z.object({ mode: z.literal('percent'), entries: z.array(z.object({ memberId: uuid, basisPoints: z.number().int().min(0).max(10_000) }).strict()).min(1).max(50) }).strict(),
  z.object({
    mode: z.literal('itemized'),
    items: z.array(z.object({ name: z.string().trim().min(1, 'Name the item.').max(60), amountPaise: paise, memberIds: people }).strict()).min(1).max(100),
    taxPaise: paiseOrZero.default(0),
    tipPaise: paiseOrZero.default(0),
    discountPaise: paiseOrZero.default(0),
  }).strict(),
])

const occurredAt = z.coerce
  .date({ error: 'Pick a date and time.' })
  .refine((d) => d.getTime() <= Date.now() + DAY_MS, 'That date is in the future.')

export const groupExpenseInputSchema = z.object({
  description: z.string().trim().min(1, 'What was it for?').max(80),
  amountPaise: paise,
  categoryId: uuid,
  occurredAt: occurredAt.default(() => new Date()),
  payers: z.array(z.object({ memberId: uuid, paidPaise: paiseOrZero }).strict()).min(1, 'Pick who paid.').max(50),
  split: splitSchema,
}).strict()
/** What a client sends (dates as strings, defaults optional). */
export type GroupExpenseBody = z.input<typeof groupExpenseInputSchema>
/** What the server works with after parsing. */
export type GroupExpenseInput = z.infer<typeof groupExpenseInputSchema>

export function expenseMemberIds(input: { payers: { memberId: string }[]; split: SplitSpec | GroupExpenseInput['split'] }): string[] {
  return [...new Set([...input.payers.map((p) => p.memberId), ...splitMemberIds(input.split as SplitSpec)])]
}

export const settlementCreateSchema = z.object({
  fromMemberId: uuid,
  toMemberId: uuid,
  amountPaise: paise,
  note: z.string().trim().max(120).nullish(),
}).strict()
export type SettlementCreate = z.infer<typeof settlementCreateSchema>

export const pageQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})
export const groupListQuerySchema = z.object({ archived: z.enum(['true', 'false']).optional() })
export const notificationListQuerySchema = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
})

/** Declared in me.ts (users own it); re-exported so group/coach code has one import site. */
export { quietHoursSchema } from './me'
