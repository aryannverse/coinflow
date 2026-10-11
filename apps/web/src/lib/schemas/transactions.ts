import { z } from 'zod'
import { isoDate, paise, uuid } from './common'

const DAY_MS = 86_400_000

const occurredAt = z.coerce
  .date({ error: 'Pick a date and time.' })
  .refine((d) => d.getTime() <= Date.now() + DAY_MS, 'That date is in the future.')

const method = z.enum(['upi', 'cash', 'card', 'other'])

const transactionFields = {
  type: z.enum(['expense', 'income']),
  amount: paise,
  categoryId: uuid,
  note: z.string().trim().max(200).nullish(),
  method,
  occurredAt,
}

export const transactionCreateSchema = z.object({
  ...transactionFields,
  method: method.default('upi'),
  occurredAt: occurredAt.default(() => new Date()),
}).strict()

// Built from the default-free fields so a partial edit never injects method/occurredAt defaults.
export const transactionPatchSchema = z.object(transactionFields).partial().strict()

export const transactionListQuerySchema = z.object({
  cursor: z.string().optional(),
  type: z.enum(['expense', 'income']).optional(),
  categoryId: uuid.optional(),
  method: z.enum(['upi', 'cash', 'card', 'other']).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['confirmed', 'draft']).default('confirmed'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type TransactionCreate = z.infer<typeof transactionCreateSchema>
export type TransactionPatch = z.infer<typeof transactionPatchSchema>
export type TransactionListQuery = z.infer<typeof transactionListQuerySchema>
