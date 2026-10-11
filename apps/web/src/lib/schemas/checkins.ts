import { z } from 'zod'
import { paiseOrZero } from './common'

export const checkinCreateSchema = z.object({ amount: paiseOrZero }).strict()
export type CheckinCreate = z.infer<typeof checkinCreateSchema>
