import { agentUrl } from '@/server/agent-proxy'
import { route } from '@/server/http'

export const dynamic = 'force-dynamic'
type Capabilities = { chat: boolean; vision: boolean; stt: boolean; tts: boolean }

/** `online` means chat works; capabilities light up voice, read-aloud and receipt scan separately. */
export const GET = route(async () => {
  if (!process.env.AGENT_SHARED_SECRET) return { data: { online: false, capabilities: null } }
  try {
    const res = await fetch(`${agentUrl()}/health`, { signal: AbortSignal.timeout(2_000), cache: 'no-store' })
    if (!res.ok) return { data: { online: false, capabilities: null } }
    const caps = ((await res.json()) as { capabilities?: Capabilities }).capabilities ?? null
    return { data: { online: Boolean(caps?.chat), capabilities: caps } }
  } catch {
    return { data: { online: false, capabilities: null } }
  }
})
