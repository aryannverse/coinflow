import { z } from 'zod'
import { agentFetch } from '@/server/agent-proxy'
import { parseJson, route } from '@/server/http'

const outcomeSchema = z.object({
  threadId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  proposalId: z.string().max(64),
  outcome: z.enum(['approved', 'dismissed', 'edited']),
  summary: z.string().max(300),
}).strict()

/** Spec §4.4: tell the thread what happened to a proposal. Best effort: never fails the user's action. */
export const POST = route(async ({ req, user }) => {
  const body = await parseJson(req, outcomeSchema)
  try {
    const res = await agentFetch(user.id, '/chat/outcome', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, timeoutMs: 5_000 })
    return { data: { logged: res.ok } }
  } catch {
    return { data: { logged: false } }
  }
})
