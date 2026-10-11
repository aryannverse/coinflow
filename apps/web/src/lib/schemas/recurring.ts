import { z } from 'zod'
import { isoDate, paise, uuid } from './common'

export const recurringCreateSchema = z.object({
  kind: z.enum(['bill', 'income']),
  name: z.string().trim().min(1, 'Name it, e.g. “Rent”.').max(60),
  amount: paise,
  cadence: z.enum(['weekly', 'monthly', 'yearly']),
  nextDueOn: isoDate,
  categoryId: uuid,
}).strict()

export const recurringPatchSchema = recurringCreateSchema.partial().extend({ active: z.boolean().optional() }).strict()

export type RecurringCreate = z.infer<typeof recurringCreateSchema>
export type RecurringPatch = z.infer<typeof recurringPatchSchema>
