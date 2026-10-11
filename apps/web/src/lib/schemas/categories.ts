import { z } from 'zod'

export const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name the category.').max(40),
  emoji: z.string().trim().min(1).max(8),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour.'),
  kind: z.enum(['expense', 'income']),
}).strict()

export type CategoryCreate = z.infer<typeof categoryCreateSchema>
