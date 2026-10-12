import { z } from 'zod'
import { uuid } from '@/lib/schemas/common'
import { agentFetch, proposalFilter, relayAgentError, SSE_HEADERS, validateProposal } from '@/server/agent-proxy'
import { parseJson, route } from '@/server/http'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // spec §10: Vercel Hobby's cap; a turn's own budget is 60 s

const chatSchema = z.object({
  message: z.string().trim().min(1, 'Type a message.').max(2000),
  threadId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  context: z.object({ route: z.string().max(200), groupId: uuid.optional() }).strict(),
  source: z.enum(['chat', 'voice', 'scan']).default('chat'),
}).strict()

/** Spec §4.2/§4.7: the browser only talks to Next; Next authenticates (Clerk) and streams the agent's SSE through. */
export const POST = route(async ({ req, user }) => {
  const body = await parseJson(req, chatSchema)
  const res = await agentFetch(user.id, '/chat', {
    method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, signal: req.signal,
  })
  if (!res.ok || !res.body) return relayAgentError(res)
  return new Response(res.body.pipeThrough(proposalFilter((p) => validateProposal(user.id, p))), { headers: SSE_HEADERS })
})
