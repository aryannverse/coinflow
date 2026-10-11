import { z } from 'zod'
import { categoryCreateSchema } from '@/lib/schemas/categories'
import { parseJson, parseQuery, route } from '@/server/http'
import { createCategory, listCategories } from '@/server/services/categories'

const query = z.object({ kind: z.enum(['expense', 'income']).optional() })

export const GET = route(async ({ req, user }) => ({ data: await listCategories(user.id, parseQuery(req, query).kind) }))
export const POST = route(async ({ req, user }) => ({ data: await createCategory(user.id, await parseJson(req, categoryCreateSchema)) }), { status: 201 })
