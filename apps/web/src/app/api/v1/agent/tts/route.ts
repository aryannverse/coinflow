import { z } from 'zod'
import { agentFetch, relayAgentError } from '@/server/agent-proxy'
import { parseJson, route } from '@/server/http'

const ttsSchema = z.object({ text: z.string().trim().min(1).max(1000) }).strict()

export const POST = route(async ({ req, user }) => {
  const body = await parseJson(req, ttsSchema)
  const res = await agentFetch(user.id, '/tts', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, timeoutMs: 30_000 })
  if (!res.ok || !res.body) return relayAgentError(res)
  return new Response(res.body, { headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' } })
})
