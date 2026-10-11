import { z } from 'zod'
import { paise } from './common'

export const budgetPutSchema = z.object({ monthlyLimit: paise }).strict()
export type BudgetPut = z.infer<typeof budgetPutSchema>
