import { z } from 'zod'
import { MAX_AMOUNT_PAISE } from '../money'

export const paise = z
  .number({ error: 'Enter an amount.' })
  .int('Amount must be in whole paise.')
  .min(1, 'Amount needs to be more than ₹0.')
  .max(MAX_AMOUNT_PAISE, 'That’s more than ₹1,00,00,000 — please check the amount.')

export const paiseOrZero = z.number().int().min(0).max(MAX_AMOUNT_PAISE)

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-11.')

export const uuid = z.uuid('That id doesn’t look right.')
