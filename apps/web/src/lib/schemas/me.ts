import { z } from 'zod'
import { paiseOrZero } from './common'

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/

export const mePatchSchema = z
  .object({
    name: z.string().trim().min(1, 'Add your name.').max(60),
    paydayDay: z.number().int().min(1).max(31),
    monthlyIncome: paiseOrZero.nullable(),
    fixedCostsEstimate: paiseOrZero,
    onboardingStep: z.number().int().min(0).max(7),
    onboarded: z.boolean(),
    theme: z.enum(['dark', 'light', 'system']),
    reducedMotion: z.enum(['on', 'off', 'system']),
    upiId: z.string().trim().regex(UPI_ID_PATTERN, 'UPI IDs look like name@bank.').nullable(),
  })
  .partial()
  .strict()

export type MePatch = z.infer<typeof mePatchSchema>
