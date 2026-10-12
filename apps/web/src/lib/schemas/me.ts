import { z } from 'zod'
import { paiseOrZero } from './common'

export const UPI_ID_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 22:00.')
/** Coach quiet hours in IST; the window may wrap midnight (22:00 → 07:00). */
export const quietHoursSchema = z.object({ start: hhmm, end: hhmm }).strict()

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
    countReceivables: z.boolean(),
    coachEnabled: z.boolean(),
    quietHours: quietHoursSchema.nullable(),
  })
  .partial()
  .strict()

export type MePatch = z.infer<typeof mePatchSchema>
